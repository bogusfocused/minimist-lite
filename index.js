module.exports = function (args, opts) {
    var unflatten = require('flat').unflatten;
    var flatten = require('flat');
    if (!opts) opts = {};

    var flags = {
        bools: {},
        strings: {},
        array: {},
        aliases: {},
        unknownFn: null
    };

    if (typeof opts['unknown'] === 'function') {
        flags.unknownFn = opts['unknown'];
    }

    if (typeof opts['boolean'] === 'boolean' && opts['boolean']) {
        flags.allBools = true;
    } else {
        []
            .concat(opts['boolean'])
            .filter(Boolean)
            .forEach(function (key) {
                flags.bools[key] = true;
            });
    }

    var aliases = flags.aliases;
    Object.keys(opts.alias || {}).forEach(function (key) {
        aliases[key] = [].concat(opts.alias[key]);
        aliases[key].forEach(function (x) {
            aliases[x] = [key].concat(
                aliases[key].filter(function (y) {
                    return x !== y;
                })
            );
        });
    });

    []
        .concat(opts.string)
        .filter(Boolean)
        .forEach(function (key) {
            flags.strings[key] = true;
            if (flags.aliases[key]) {
                flags.strings[flags.aliases[key]] = true;
            }
        });

    []
        .concat(opts.array)
        .filter(Boolean)
        .forEach(function (key) {
            flags.array[key] = true;
            if (flags.aliases[key]) {
                flags.array[flags.aliases[key]] = true;
            }
        });

    var defaults = flatten(opts['default'] || {});

    var argv = { _: [] };
    Object.keys(flags.bools).forEach(function (key) {
        setArg(key, defaults[key] === undefined ? false : defaults[key]);
    });

    var notFlags = [];

    if (args.indexOf('--') !== -1) {
        notFlags = args.slice(args.indexOf('--') + 1);
        args = args.slice(0, args.indexOf('--'));
    }

    function argDefined(key, arg) {
        return (
            (flags.allBools && /^--[^=]+$/.test(arg)) ||
            flags.strings[key] ||
            flags.bools[key] ||
            flags.array[key] ||
            flags.aliases[key]
        );
    }

    function setArg(key, val, arg) {
        if (arg && flags.unknownFn && !argDefined(key, arg)) {
            if (flags.unknownFn(arg) === false) return;
        }

        var value = !flags.strings[key] && isNumber(val) ? Number(val) : val;
        setKey(argv, key, value);

        (aliases[key] || []).forEach(function (x) {
            setKey(argv, x, value);
        });
    }

    function setKey(obj, key, value) {
        var o = obj;
        if (key === '__proto__') return;
        if (o[key] === undefined) {
            o[key] = flags.array[key] ? [value] : value;
        } else if (flags.bools[key] || typeof o[key] === 'boolean') {
            o[key] = value;
        } else if (Array.isArray(o[key])) {
            o[key].push(value);
        } else {
            o[key] = [o[key], value];
        }
    }

    function aliasIsBoolean(key) {
        return aliases[key].some(function (x) {
            return flags.bools[x];
        });
    }

    for (var i = 0; i < args.length; i++) {
        var arg = args[i];

        if (/^--.+=/.test(arg)) {
            // Using [\s\S] instead of . because js doesn't support the
            // 'dotall' regex modifier. See:
            // http://stackoverflow.com/a/1068308/13216
            var m = arg.match(/^--([^=]+)=([\s\S]*)$/);
            var key = m[1];
            var value = m[2];
            if (flags.bools[key]) {
                value = value !== 'false';
            }
            setArg(key, value, arg);
        } else if (/^--.+:/.test(arg)) {
            var m = arg.match(/^--([^=]+):([\s\S]*)$/);
            var key = m[1];
            var value = m[2];
            if (flags.array[key] === undefined) {
                flags.array[key] = true;
                if (flags.aliases[key]) {
                    flags.array[flags.aliases[key]] = true;
                }
            }
            if (flags.bools[key]) {
                value = value !== 'false';
            }
            setArg(key, value, arg);
        } else if (/^--no-.+/.test(arg)) {
            var key = arg.match(/^--no-(.+)/)[1];
            setArg(key, false, arg);
        } else if (/^--.+/.test(arg)) {
            var key = arg.match(/^--(.+)/)[1];
            var next = args[i + 1];
            if (
                next !== undefined &&
                !/^-/.test(next) &&
                !flags.bools[key] &&
                !flags.allBools &&
                (aliases[key] ? !aliasIsBoolean(key) : true)
            ) {
                setArg(key, next, arg);
                i++;
            } else if (/^(true|false)$/.test(next)) {
                setArg(key, next === 'true', arg);
                i++;
            } else {
                setArg(key, flags.strings[key] ? '' : true, arg);
            }
        } else if (/^-[^-]+/.test(arg)) {
            var letters = arg.slice(1, -1).split('');

            var broken = false;
            for (var j = 0; j < letters.length; j++) {
                var next = arg.slice(j + 2);

                if (next === '-') {
                    setArg(letters[j], next, arg);
                    continue;
                }

                if (/[A-Za-z]/.test(letters[j]) && /=/.test(next)) {
                    setArg(letters[j], next.split('=')[1], arg);
                    broken = true;
                    break;
                }

                if (
                    /[A-Za-z]/.test(letters[j]) &&
                    /-?\d+(\.\d*)?(e-?\d+)?$/.test(next)
                ) {
                    setArg(letters[j], next, arg);
                    broken = true;
                    break;
                }

                if (letters[j + 1] && letters[j + 1].match(/\W/)) {
                    setArg(letters[j], arg.slice(j + 2), arg);
                    broken = true;
                    break;
                } else {
                    setArg(
                        letters[j],
                        flags.strings[letters[j]] ? '' : true,
                        arg
                    );
                }
            }

            var key = arg.slice(-1)[0];
            if (!broken && key !== '-') {
                if (
                    args[i + 1] &&
                    !/^(-|--)[^-]/.test(args[i + 1]) &&
                    !flags.bools[key] &&
                    (aliases[key] ? !aliasIsBoolean(key) : true)
                ) {
                    setArg(key, args[i + 1], arg);
                    i++;
                } else if (args[i + 1] && /^(true|false)$/.test(args[i + 1])) {
                    setArg(key, args[i + 1] === 'true', arg);
                    i++;
                } else {
                    setArg(key, flags.strings[key] ? '' : true, arg);
                }
            }
        } else {
            if (!flags.unknownFn || flags.unknownFn(arg) !== false) {
                argv._.push(
                    flags.strings['_'] || !isNumber(arg) ? arg : Number(arg)
                );
            }
            if (opts.stopEarly) {
                argv._.push.apply(argv._, args.slice(i + 1));
                break;
            }
        }
    }

    Object.keys(defaults).forEach(function (key) {
        if (!(key in argv)) {
            setKey(argv, key, defaults[key]);

            (aliases[key] || []).forEach(function (x) {
                setKey(argv, x, defaults[key]);
            });
        }
    });

    if (opts['--']) {
        argv['--'] = new Array();
        notFlags.forEach(function (key) {
            argv['--'].push(key);
        });
    } else {
        notFlags.forEach(function (key) {
            argv._.push(key);
        });
    }

    return unflatten(argv);
};



function isNumber(x) {
    if (typeof x === 'number') return true;
    if (/^0x[0-9a-f]+$/i.test(x)) {
        try {
            return Number(x) <= Number.MAX_SAFE_INTEGER;
        } catch {
            return false;
        }
    }
    return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(e[-+]?\d+)?$/.test(x);
}
