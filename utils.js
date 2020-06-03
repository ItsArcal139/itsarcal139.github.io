// utils.js
// (c) 2020 Kaka.
(_ => {
    var exports = {};

    class Arrays {
        /**
         * Returns the reversed copy of an array.
         * @param {any[]} arr The source array.
         * @return {any[]} The reversed copy of the passed array.
         */
        static reversedCopy(arr) {
            var result = [];
            arr.forEach(n => {
                result.push(n);
            });
            return result.reverse();
        }
    }
    exports.Arrays = Arrays;

    class Timings {
        /**
         * Calculate the length of a beat in renderer.
         * @param {number} bpm The beats amount per minutes.
         * @returns {number} The corresponding milliseconds.
         */
        static bpmToMillis(bpm) {
            return 120 / bpm * 1000;
        }
        
        /**
         * Calculate the BPM of the beat in renderer.
         * @param {number} millis The time length of a beat in renderer.
         * @returns {number} The beats amount per minutes. 
         */
        static millisToBpm(millis) {
            return 120 / (millis / 1000);
        }

        static speedToDetune(speed) {
            // 0.5x => -1200
            // 1x => 0
            // 2x => 1200
            return Math.log2(speed) * 1200;
        }
    }
    exports.Timings = Timings;

    class Maths {
        /**
         * Linear interpolates between `a` and `b`.
         * @param {number} a The `a` value.
         * @param {number} b The `b` value.
         * @param {number} t The progress of linear interpolation.
         * @returns {number} The result value.
         */
        static lerp(a, b, t) {
            return a + (b - a) * t;
        }
    }
    exports.Maths = Maths;

    class Vector2 {
        /**
         * Creates a `Vector2` data represents a 2D vector.
         * @param {number} x The x coordinate.
         * @param {number} y The y coordinate.
         */
        constructor(x, y) {
            this.x = x;
            this.y = y;
        }

        /**
         * 
         * @param {number} n The multiplier.
         * @returns {Vector2} The multiplied vector.
         */
        times(n) {
            return new Vector2(this.x * n, this.y * n);
        }

        /**
         * Get a copy of the normalized vector.
         * @returns {Vector2} The normalized vector.
         */
        normalize() {
            var dist = Math.sqrt(Math.pow(this.x, 2) + Math.pow(this.y, 2));
            return new Vector2(this.x / dist, this.y / dist);
        }

        /**
         * 
         * @param {Vector2} v The second vector.
         * @returns {Vector2} The result vector.
         */
        plus(v) {
            return new Vector2(this.x + v.x, this.y + v.y);
        }

        /**
         * 
         * @param {Vector2} v The second vector.
         * @returns {Vector2} The result vector.
         */
        minus(v) {
            return new Vector2(this.x - v.x, this.y - v.y);
        }

        /**
         * 
         * @param {Vector2} a 
         * @param {Vector2} b 
         * @param {number} t 
         * @returns {Vector2} The result vector.
         */
        static lerp(a, b, t) {
            return a.plus(b.minus(a).times(t));
        }

        /**
         * 
         * @param {Vector2} a 
         * @param {Vector2} b 
         * @returns {Vector2} The result vector.
         */
        static center(a, b) {
            return a.plus(b).times(0.5);
        }

        /**
         * @returns {Vector2}
         */
        clone() {
            return this.times(1);
        }
    }
    exports.Vector2 = Vector2;

    class DataUpgrader {
        constructor() {
            this.versions = [];
        }

        addVersion(num, upgrade, downgrade) {
            this.versions.push({
                version: num,
                upgrade, downgrade
            });
        }

        getNewestVersion() {
            var n = 0;
            var v = null;
            this.versions.forEach(ver => {
                var o = n;
                n = Math.max(n, ver.version);
                if(o != n) v = ver;
            });
            return v;
        }

        getNextVersion(n) {
            var v = null;
            this.versions.forEach(ver => {
                if(ver.version > n.version && v == null) {
                    v = ver;
                }
            });
            return v;
        }

        upgrade(data, sourceVersion, targetVersion) {
            targetVersion = targetVersion || this.getNewestVersion();
            var newVersion = this.getNextVersion(sourceVersion);
            do {
                this.performUpgrade(data, newVersion);
                newVersion = this.getNextVersion(newVersion);
            } while(newVersion.version < targetVersion.version)
        }

        performUpgrade(data, version) {
            version.upgrade(data);
        }

        performDowngrade(data, version) {
            version.downgrade(data);
        }
    }
    exports.DataUpgrader = DataUpgrader;

    class Serializer {
        static deserialize(data, clazz, keys) {
            var result = {};
            keys = keys || Object.keys(data);
            keys.forEach(k => {
                var newName = "";
                var upperCase = false;
                for(var i = 0; i < k.length; i++) {
                    if(k[i] == "_") {
                        upperCase = true;
                        continue;
                    }
                    newName += (upperCase ? k[i].toUpperCase() : k[i].toLowerCase());
                    upperCase = false;
                }
                result[newName] = data[k];
            });
            result.__proto__ = clazz.prototype;
            return result;
        }

        static serialize(data, keys) {
            var result = {};
            keys = keys || Object.keys(data);
            keys.forEach(k => {
                var newName = "";
                for(var i = 0; i < k.length; k++) {
                    var c = k[i];
                    if(c.toUpperCase() == c) {
                        c = c.toLowerCase();
                        newName += "_";
                    }
                    newName += c;
                }
                result[newName] = data[k];
            });
            return result;
        }
    }
    exports.Serializer = Serializer;

    exports.Promiser = {
        noop() {
            return new Promise(r => { r() });
        }
    };

    // Export to the K namespace.
    _.K = exports;
})(window);