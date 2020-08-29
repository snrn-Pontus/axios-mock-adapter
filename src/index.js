import handleRequest from "./handle_request";
import { createAxiosError } from "./utils";
import isEqual from "fast-deep-equal";

const VERBS = [
  "get",
  "post",
  "head",
  "delete",
  "patch",
  "put",
  "options",
  "list",
];

export default class MockAdapter {
  constructor(axiosInstance, options, knownRouteParams) {
    reset.call(this);

    // TODO throw error instead when no axios instance is provided
    if (axiosInstance) {
      this.axiosInstance = axiosInstance;
      this.originalAdapter = axiosInstance.defaults.adapter;
      this.delayResponse =
        options && options.delayResponse > 0 ? options.delayResponse : null;
      this.onNoMatch = (options && options.onNoMatch) || null;
      this.knownRouteParams = getValidRouteParams(knownRouteParams);
      axiosInstance.defaults.adapter = this.adapter.call(this);
    }

    this.restore = function restore() {
      if (this.axiosInstance) {
        this.axiosInstance.defaults.adapter = this.originalAdapter;
        this.axiosInstance = undefined;
      }
    };

    this.reset = reset;
    this.resetHandlers = resetHandlers;
    this.resetHistory = resetHistory;

    VERBS.concat("any").forEach(function (method) {
      const methodName =
        "on" + method.charAt(0).toUpperCase() + method.slice(1);
      MockAdapter.prototype[methodName] = function (
        incMatcher,
        body,
        requestHeaders
      ) {
        const _this = this;
        const originalMatcher = incMatcher;
        const matcher = getMatcher(incMatcher, _this.knownRouteParams);

        function reply(code, response, headers) {
          const handler = [
            matcher,
            body,
            requestHeaders,
            code,
            response,
            headers,
            originalMatcher,
          ];
          addHandler(method, _this.handlers, handler);
          return _this;
        }

        function replyOnce(code, response, headers) {
          const handler = [
            matcher,
            body,
            requestHeaders,
            code,
            response,
            headers,
            originalMatcher,
            true,
          ];
          addHandler(method, _this.handlers, handler);
          return _this;
        }

        return {
          reply: reply,

          replyOnce: replyOnce,

          passThrough: function passThrough() {
            const handler = [matcher, body];
            addHandler(method, _this.handlers, handler);
            return _this;
          },

          abortRequest: function () {
            return reply(function (config) {
              const error = createAxiosError(
                "Request aborted",
                config,
                undefined,
                "ECONNABORTED"
              );
              return Promise.reject(error);
            });
          },

          abortRequestOnce: function () {
            return replyOnce(function (config) {
              const error = createAxiosError(
                "Request aborted",
                config,
                undefined,
                "ECONNABORTED"
              );
              return Promise.reject(error);
            });
          },

          networkError: function () {
            return reply(function (config) {
              const error = createAxiosError("Network Error", config);
              return Promise.reject(error);
            });
          },

          networkErrorOnce: function () {
            return replyOnce(function (config) {
              const error = createAxiosError("Network Error", config);
              return Promise.reject(error);
            });
          },

          timeout: function () {
            return reply(function (config) {
              const error = createAxiosError(
                config.timeoutErrorMessage ||
                  "timeout of " + config.timeout + "ms exceeded",
                config,
                undefined,
                "ECONNABORTED"
              );
              return Promise.reject(error);
            });
          },

          timeoutOnce: function () {
            return replyOnce(function (config) {
              const error = createAxiosError(
                config.timeoutErrorMessage ||
                  "timeout of " + config.timeout + "ms exceeded",
                config,
                undefined,
                "ECONNABORTED"
              );
              return Promise.reject(error);
            });
          },
        };
      };
    });
  }
  adapter() {
    return function (config) {
      const mockAdapter = this;
      // axios >= 0.13.0 only passes the config and expects a promise to be
      // returned. axios < 0.13.0 passes (config, resolve, reject).
      if (arguments.length === 3) {
        handleRequest(mockAdapter, arguments[0], arguments[1], arguments[2]);
      } else {
        return new Promise(function (resolve, reject) {
          handleRequest(mockAdapter, resolve, reject, config);
        });
      }
    }.bind(this);
  }
}

export function getVerbObject() {
  return VERBS.reduce(function (accumulator, verb) {
    accumulator[verb] = [];
    return accumulator;
  }, {});
}

export function reset() {
  resetHandlers.call(this);
  resetHistory.call(this);
}

export function resetHandlers() {
  this.handlers = getVerbObject();
}

export function resetHistory() {
  this.history = getVerbObject();
}

export function findInHandlers(method, handlers, handler) {
  let index = -1;
  for (let i = 0; i < handlers[method].length; i += 1) {
    const item = handlers[method][i];
    const isReplyOnce = item.length === 8;
    const comparePaths =
      item[0] instanceof RegExp && handler[0] instanceof RegExp
        ? String(item[0]) === String(handler[0])
        : item[0] === handler[0];
    const isSame =
      comparePaths &&
      isEqual(item[1], handler[1]) &&
      isEqual(item[2], handler[2]);
    if (isSame && !isReplyOnce) {
      index = i;
    }
  }
  return index;
}

export function addHandler(method, handlers, handler) {
  if (method === "any") {
    VERBS.forEach(function (verb) {
      handlers[verb].push(handler);
    });
  } else {
    const indexOfExistingHandler = findInHandlers(method, handlers, handler);
    if (indexOfExistingHandler > -1 && handler.length < 8) {
      handlers[method].splice(indexOfExistingHandler, 1, handler);
    } else {
      handlers[method].push(handler);
    }
  }
}

export function getValidRouteParams(knownRouteParams) {
  if (typeof knownRouteParams !== "object") {
    return null;
  }

  const valid = {};
  let hasValidParams = false;

  Object.keys(knownRouteParams).forEach(function (param) {
    if (/^:(.+)|{(.+)}$/.test(param)) {
      valid[param] = knownRouteParams[param];
      hasValidParams = true;
    }
  });

  return hasValidParams ? valid : null;
}

export function getMatcher(incMatcher, knownRouteParams) {
  let matcher = incMatcher;
  if (matcher === undefined) {
    return /.*/;
  }

  if (typeof matcher === "string" && knownRouteParams !== null) {
    Object.keys(knownRouteParams).forEach(function (param) {
      matcher = matcher.replace(param, "(" + knownRouteParams[param] + ")");
    });
    return new RegExp("^" + matcher + "$");
  }

  return matcher;
}
