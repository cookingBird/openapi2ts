
function toStringType(v) {
  return Object.prototype.toString.call(v).toLowerCase()
}

function mergeStrategy(cfg1, cfg2, key) {
  if (!cfg2) return cfg1;
  if (toStringType(cfg1) !== toStringType(cfg2))
  {
    console.error('config type error');
    return cfg1;
  };

  if (key === 'omitTypes') return [...cfg1, ...cfg2];

  return cfg2;
}

function merge(defaultCfg, config, key) {

  if (key === 'convertTypes') return { ...defaultCfg, ...config };

  return Object.entries(defaultCfg)
    .reduce((pre, cur) => {
      const [key, value] = cur;
      return {
        ...pre,
        [key]: toStringType(value) === '[object object]'
          ? merge(value, config[key], key)
          : mergeStrategy(value, config[key], key)
      }
    }, {})
}

module.exports = merge;
