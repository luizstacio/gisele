describe('Model', function() {
    /* globals Model, ModelMethods, Field */
    function createModel() {
        return Model.create({
            name: 'Person',
            fields: {
                name: String,
                age: Number
            }
        });
    }

    /**
     * Model::create(config)
     *
     * config: {
     *      name: 'ModelName',
     *      fields: {},
     *      methods: {}
     * }
     *
     * fields: {
     *      name: { type: String, maxlength: 255, required: true, pattern: '[a-z0-9-]' }
     *      age:  Number,
     *      birth: Date,
     *      relation: { type: OtherModel, collection: true }    // array of models
     *      circular: { type: 'self' }
     * }
     *
     * methods: {
     *      foo(),
     *      bar()
     * }
     */
    describe('::create(config)', function() {
        it('should create a new model constructor from a table of fields', function() {
            var fields = {
                model: 'self'
            };

            var config = {
                name: 'MyModel',
                fields: fields
            };

            var MyModel = Model.create(config);

            expect(MyModel.__name__).toBe('MyModel');

            expect(Array.isArray(MyModel.__fields__)).toBe(true);
            expect(MyModel.__fields__.length).toBe(1);
            expect(MyModel.__fields__[0] instanceof Field).toBe(true);
        });

        it('should subclass the base model', function() {
            var Person = createModel();

            var instance = new Person();
            expect(instance instanceof Person).toBe(true);
            expect(instance instanceof Model).toBe(true);
        });

        it('should throw an error if no config was provided', function () {
            function test () {
                Model.create();
            }

            expect(test).toThrow(new Error('Invalid model configuration'));
        });
    });

    describe('::defineProperty(name, field)', function() {
        it('should configure a model property', function() {
            var model = {};

            model.$$ = {
                set: jasmine.createSpy('setter'),
                get: jasmine.createSpy('getter')
            };

            var field = Field.create({
                name: 'foo',
                type: String
            });

            Model.defineProperty(model, field);

            var foo = '_foo_';
            model.foo = foo;
            foo = model.foo;

            expect(model.$$.set).toHaveBeenCalledWith('foo', '_foo_');
            expect(model.$$.get).toHaveBeenCalledWith('foo');
        });

        it('should NOT allow to write a readOnly field', function() {
            var model = {};

            model.$$ = {
                set: jasmine.createSpy('setter'),
                get: jasmine.createSpy('getter')
            };

            var field = Field.create({
                name: 'foo',
                type: String,
                readOnly: true
            });

            Model.defineProperty(model, field);
            model.foo = 'foo';

            expect(model.$$.set).not.toHaveBeenCalled();
        });
    });

    describe('::initialize(self, Constructor)', function() {
        it('should configure a model instance (properties and model methods)', function() {
            var self = {};

            var Ctor = function DummyConstructor() {};
            Ctor.__fields__ = [];

            Model.initialize(self, Ctor);

            expect(self.$$ instanceof ModelMethods).toBe(true);

            // check writable = false
            var invalidValue = {};
            try {
                self.$$ = invalidValue;
            } catch (e) {}

            expect(self.$$).not.toBe(invalidValue);

            // initial setup
            expect(self.$$.data).toEqual({});
            expect(self.$$.changed).toBe(false);
            expect(self.$$.Model).toBe(Ctor);
        });
    });

    describe('::createField(config)', function() {
        it('should throw an error if the config is not valid', function() {
            function test() {
                Model.createField('foo', null);
            }

            expect(test).toThrow(Error('Invalid field config'));
        });

        it('should throw an error if the type is not valid', function() {
            function test() {
                Model.createField('foo', {
                    type: {}
                });
            }

            expect(test).toThrow(Error('Invalid field type'));
        });

        it('should replace a circular reference with the model constructor', function() {
            function Constructor() {}

            var field = Model.createField('test', 'self', Constructor);

            expect(field instanceof Field).toBe(true);
            expect(field.type).toBe(Constructor);

            field = Model.createField('test', {
                type: 'self'
            }, Constructor);

            expect(field instanceof Field).toBe(true);
            expect(field.type).toBe(Constructor);
        });

        it('should return an instance of Field', function() {
            function Constructor() {}

            var customField = Model.createField('age', 'self', Constructor);
            expect(customField.name).toBe('age');
            expect(customField.type).toBe(Constructor);
        });
    });

    describe('::applyValues(model, Constructor, data)', function() {
        it('should apply a set of values to a model instance using the field constructors', function() {
            var Person = createModel();

            var TestModel = Model.create({
                fields: {
                    string: String,
                    number: Number,
                    bool: Boolean,
                    self: 'self',
                    person: Person
                }
            });

            var dataStructure = {
                string: 'foo',
                number: '123',
                bool: 1,
                self: null,
                ignore: 'this',
                person: {
                    name: 'John',
                    age: 30
                }
            };

            var instance = new TestModel(dataStructure);

            expect(instance.string).toBe('foo');
            expect(instance.number).toBe(123);
            expect(instance.bool).toBe(true);
            expect(instance.self).toBe(null);
            expect(instance.ignore).toBe(undefined);

            expect(instance.person instanceof Person).toBe(true);
            expect(instance.person.name).toBe('John');
            expect(instance.person.age).toBe(30);
        });
    });

    describe('Model methods', function() {
        it('should handle model changes', function() {
            var data = {
                name: 'Paul'
            };

            var MyModel = createModel();
            var instance = new MyModel(data);

            // calls $$.set to apply changes on local object
            instance.name = 'New name';
            expect(instance.$$.changed.name).toBe('New name');

            // original model data is untouched
            expect(data.name).toBe('Paul');

            // reads from changed data
            expect(instance.name).toBe('New name');
            expect(instance.$$dirty).toBe(true);

            // apply the changes
            instance.$$.commit();

            // now the original data model is touched
            expect(instance.name).toBe('New name');
            expect(instance.$$dirty).toBe(false);

            instance.$$dirty = true;
            // ignore changes
            expect(instance.$$dirty).toBe(false);

            instance.name = 'Other name';

            // new value saved again but not commited
            expect(instance.name).toBe('Other name');

            // revert the changes
            instance.$$.rollback();

            // previous value restored
            expect(instance.name).toBe('New name');
        });
    });

    describe('performance', function() {
        it('should be fast', function() {
            var data = {
                name: 'John',
                age: 30
            };

            var list = new Array(1000);
            var i = 1000;
            var Person = createModel();

            var t0 = Date.now();

            while (i--) {
                new Person(data);
            }

            var t1 = Date.now();
            var time = t1 - t0;

            if (time > 25) {
                console.error('Construction of 1000 models took ' + time + ' milliseconds.');
            }
        });
    });

    describe('#toString()', function() {
        it('should return the model name', function() {
            var Person = createModel();
            var instance = new Person(null);

            expect(String(instance)).toBe('Person');
        });
    });

    describe('#toJSON()', function() {
        it('should mix changed state and model data into one object and return it', function() {
            var Person = Model.create({
                name: 'Person',
                fields: {
                    gender: {
                        type: String,
                        default: 'male'
                    },
                    age: Number,
                    name: String,
                    father: 'self'
                }
            });

            var instance = new Person({
                name: 'John',
                age: 20,

                father: {
                    name: 'Tom',
                    age: 10
                }
            });

            instance.name = 'Peter';

            var json = instance.toJSON();

            expect(json).toEqual({
                // dirty value
                name: 'Peter',

                // construction data
                age: 20,

                // default value
                gender: 'male',

                // submodel
                father: {
                    name: 'Tom',
                    age: 10,
                    gender: 'male'
                }
            });
        });
    });

    describe('default values on fields', function() {
        it('should initialize field values with their defaults but still apply data at construction', function() {
            var Orange = Model.create({
                name: 'Orange',
                fields: {
                    color: {
                        type: String,
                        default: 'orange'
                    },
                    calories: {
                        type: Number,
                        default: 100
                    },
                    isFruit: {
                        type: Boolean,
                        default: true
                    },
                }
            });

            var fruit = new Orange({
                calories: 120,
                ignore: 'this'
            });

            expect(fruit.color).toBe('orange');
            expect(fruit.calories).toBe(120);
            expect(fruit.isFruit).toBe(true);
        });
    });

    describe('relationships', function() {
        it('should handle a relationship between models', function() {
            var Person = Model.create({
                name: 'Person',
                fields: {
                    name: String,
                    age: Number,
                    dateOfBirth: Date,
                    father: 'self',
                    mother: 'self'
                }
            });

            var john = {
                name: 'John Doe',
                age: 30
            };

            var jane = {
                name: 'Jane Doe',
                age: 27
            };

            var jack = new Person({
                name: 'Jack Doe',
                age: 8,
                dateOfBirth: '2001-12-16T03:15:00Z',
                father: john,
                mother: jane
            });

            expect(jack instanceof Person).toBe(true);
            expect(jack.father instanceof Person).toBe(true);
            expect(jack.mother instanceof Person).toBe(true);

            // replaces the instance of Person with another one on update
            jack.father = {
                name: 'James'
            };

            expect(jack.father instanceof Person).toBe(true);

            jack.foo = 'bar';
            jack.$$.data.foo = 'baz';

            var json = jack.toJSON();

            // toJSON() must save the relationships
            expect(json).toEqual({
                'name': 'Jack Doe',
                'age': 8,
                'dateOfBirth': '2001-12-16T03:15:00.000Z',
                'father': {
                    'name': 'James'
                },
                'mother': {
                    'name': 'Jane Doe',
                    'age': 27
                }
            });
        });
    });

    describe('custom methods', function() {
        it('should allow custom methods to be added on models', function() {
            var MyModel = Model.create({
                name: 'Foo',

                fields: {
                    name: String
                },

                methods: {
                    foo: function() {
                        this.$$.set('name', 'foo');
                    },

                    bar: function() {
                        this.$$.rollback();
                    }
                }
            });

            var instance = new MyModel({
                name: 'test'
            });

            // calls internal method to update name
            instance.foo();
            expect(instance.name).toBe('foo');

            instance.bar();
            // calls rollback() internally
            expect(instance.name).toBe('test');
        });

        it('should NOT allow custom methods that conflict with properties', function() {
            function test() {
                Model.create({
                    fields: {
                        foo: String
                    },

                    methods: {
                        foo: function() {}
                    }
                });
            }

            expect(test).toThrow(new Error('Cannot override field foo with a custom method of same name'));
        });
    });
});
