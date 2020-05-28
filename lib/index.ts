import { isEqual } from "lodash";
import diffSequences from "diff-sequences";
import { JsonDifferences } from "./JsonDifferences";

/** @typedef {Array | Object | number | string | boolean | null} JSON */

/** @typedef {"create" | "update" | "delete" | "child-update"} Change */

/**
 * @typedef {string} Path
 * A path like "foo/2/bar/baz"
 */

/** @typedef {Object<Path, Change>} DiffMap */

/** @typedef {{
 *   create: number,
 *   update: number,
 *   delete: number
 *   }} DiffCount
 */

const CREATE = "create";
const UPDATE = "update";
const DELETE = "delete";
const CHILD_UPDATE = "child-update";

/**
 * Compare two JSON objects and return the difference between the left and
 * right object as a map with the path as key, and the change as value.
 *
 * Changes can be: "create", "update", "delete", or "child-update".
 * Here, "child-update" means the object itself is not changed but one
 * or more of it"s childs have.
 *
 * @param {JSON} left
 * @param {JSON} right
 * @return {{
 *   diffLeft: DiffMap,
 *   diffRight: DiffMap
 *   count: DiffCount
 * }}
 */
export function diff(left: any, right: any): JsonDifferences {
    const diffLeft = {};
    const diffRight = {};
    const count: any = {
        [CREATE]: 0,
        [UPDATE]: 0,
        [DELETE]: 0,
    };

    /**
     * Add a change to the diff objects
     * @param {*} value
     * @param {string} path
     * @param {Change} change
     * @param {DiffMap} diff
     * @private
     */
    function addChange(value: any, path: any, change: any, diff: any) {
        diff[path] = change;
        count[change] += change === UPDATE
            ? 0.5 // change of type UPDATE is always fired twice, for left and right panel. TODO: find a better solution
            : 1;

        // loop over all parent paths to mark them as having a changed child
        forEachParent(path, (p: any) => {
            if (!diff[p]) {
                diff[p] = CHILD_UPDATE;
            }
        });

        if ((change === DELETE || change === CREATE) && (Array.isArray(value) || isObject(value))) {
            // loop over all children to mark them created or deleted
            traverse(value, path, (v: any, childPath: any) => diff[childPath] = change);
        }
    }

    /**
     * Recursively loop over the leftObj and rightObj JSON object to find all differences
     * @param {JSON} leftObj
     * @param {JSON} rightObj
     * @param {Path | string} pathLeft
     * @param {Path | string} pathRight
     * @private
     */
    function _calculateDiff(leftObj: any, rightObj: any, pathLeft = "", pathRight = "") {
        // iterate over two arrays
        if (Array.isArray(leftObj) && Array.isArray(rightObj)) {
            arrayDiff(leftObj, rightObj, (change: any, aIndex: any, bIndex: any) => {
                const childPathLeft = pathLeft + "/" + aIndex;
                const childPathRight = pathRight + "/" + bIndex;

                if (change === CREATE) {
                    addChange(rightObj[bIndex], childPathRight, CREATE, diffRight);
                } else if (change === UPDATE) {
                    _calculateDiff(leftObj[aIndex], rightObj[bIndex], childPathLeft, childPathRight);
                } else if (change === DELETE) {
                    addChange(leftObj[aIndex], childPathLeft, DELETE, diffLeft);
                }
            });

            return;
        }

        // iterate over two objects
        if (isObject(leftObj) && isObject(rightObj)) {
            const uniqueKeys = new Set(Object.keys(leftObj).concat(Object.keys(rightObj)));

            uniqueKeys.forEach(key => {
                const childPathLeft = pathLeft + "/" + key;
                const childPathRight = pathRight + "/" + key;

                _calculateDiff(leftObj[key], rightObj[key], childPathLeft, childPathRight);
            });

            return;
        }

        // compare any mix of primitive values or Array or Object
        if (leftObj !== rightObj) {
            // since we already checked whether both leftObj and rightObj are an Array or both are an Object,
            // we can only end up when they are not both an Array or both an Object. Hence, they
            // switched from Array to Object or vice versa
            const switchedArrayOrObjectType = Array.isArray(leftObj) || isObject(leftObj) || Array.isArray(rightObj) || isObject(rightObj);

            if (leftObj !== undefined) {
                const change = (rightObj === undefined || switchedArrayOrObjectType) ? DELETE : UPDATE;
                addChange(leftObj, pathLeft, change, diffLeft);
            }

            if (rightObj !== undefined) {
                const change = (leftObj === undefined || switchedArrayOrObjectType) ? CREATE : UPDATE;
                addChange(rightObj, pathRight, change, diffRight);
            }
        }
    }

    _calculateDiff(left, right);

    return {
        diffLeft,
        diffRight,
        count,
    };
}

/**
 * Get the difference between two Arrays or strings.
 * For every change (create, update, delete) the callback function is invoked
 *
 * @param {Array<JSON> | string} a
 * @param {Array<JSON> | string} b
 * @param {function(change: "create" | "update" | "delete", aIndex: number, bIndex: number)} callback
 */
function arrayDiff(a: any, b: any, callback: any) {
    const diff: any = [];
    let aIndex = 0;
    let bIndex = 0;

    function isCommon(indexA: any, indexB: any) {
        return isEqual(a[indexA], b[indexB]);
    }

    function foundSubsequence(nCommon: any, aCommon: any, bCommon: any) {
        const aCount = aCommon - aIndex;
        const bCount = bCommon - bIndex;
        const updateCount = Math.min(aCount, bCount);

        for (let uIndex = 0; uIndex < updateCount; uIndex++) {
            callback(UPDATE, aIndex, bIndex);
            aIndex++;
            bIndex++;
        }

        while (aIndex < aCommon) {
            callback(DELETE, aIndex, bIndex);
            aIndex++;
        }

        while (bIndex < bCommon) {
            callback(CREATE, aIndex, bIndex);
            bIndex++;
        }

        aIndex += nCommon;
        bIndex += nCommon;
    }

    diffSequences(a.length, b.length, isCommon, foundSubsequence);
    foundSubsequence(0, a.length, b.length);

    return diff;
}

/**
 * recursively loop over all items of an array or object
 * @param {JSON} json
 * @param {Path | string} path
 * @param {function(json: JSON, path: Path)} callback
 */
function traverse(json: any, path = "", callback: any) {
    callback(json, path);

    if (Array.isArray(json)) {
        for (let i = 0; i < json.length; i++) {
            traverse(json[i], path + "/" + i, callback);
        }
    } else if (isObject(json)) {
        Object.keys(json).forEach(key => {
            traverse(json[key], path + "/" + key, callback);
        });
    }
}

/**
 * Invoke a callback for every parent path of a given path like "foo/2/bar/baz"
 * @param {Path | string} path
 * @param {function(parentPath: Path | string)} callback
 */
function forEachParent(path: any, callback: any) {
    let parentPath = path;
    let index;
    do {
        index = parentPath.lastIndexOf("/");
        if (index !== -1) {
            parentPath = parentPath.substring(0, index);
            callback(parentPath);
        }
    } while (index !== -1);

    callback("");
}

/**
 * Test whether a value is an object (and not null or an Array)
 * @param {JSON} json
 * @return {boolean}
 */
function isObject(json: any) {
    return json != null && typeof json === "object" && !Array.isArray(json);
}
