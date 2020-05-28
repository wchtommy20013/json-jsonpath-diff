import * as assert from 'assert';
import * as chai from "chai";
import * as Mocha from 'mocha';
import * as sample from "..";

const suite = Mocha.describe;
const test = Mocha.it;

const expect = chai.expect;

export const BaseTest = () => {
    suite('Base', () => {
        test('init', async () => {
            expect(sample.diff({ "Hello": " World" }, { "a": "b" }))
                .deep.eq({
                    "diffLeft": {
                        "/Hello": "delete",
                        "": "child-update"
                    },
                    "diffRight": {
                        "/a": "create",
                        "": "child-update"
                    },
                    "count": {
                        "create": 1,
                        "update": 0,
                        "delete": 1
                    }
                });
        });
    });
};

BaseTest();
