import axios from "axios";
import isEqual from "fast-deep-equal";

const toString = Object.prototype.toString;

// < 0.13.0 will not have default headers set on a custom instance
const rejectWithError = !!axios.create().defaults.headers;

export function find(array, predicate) {
  const length = array.length;
  for (let i = 0; i < length; i++) {
    const value = array[i];
    if (predicate(value)) return value;
  }
}

export function isFunction(val) {
  return toString.call(val) === "[object Function]";
}

export function isObjectOrArray(val) {
  return val !== null && typeof val === "object";
}

export function isStream(val) {
  return isObjectOrArray(val) && isFunction(val.pipe);
}

export function isArrayBuffer(val) {
  return toString.call(val) === "[object ArrayBuffer]";
}

export function combineUrls(baseURL, url) {
  if (baseURL) {
    return baseURL.replace(/\/+$/, "") + "/" + url.replace(/^\/+/, "");
  }

  return url;
}

export function findHandler(
  handlers,
  method,
  url,
  body,
  parameters,
  headers,
  baseURL
) {
  return handlers[method.toLowerCase()].find(function (handler) {
    if (typeof handler[0] === "string") {
      return (
        (isUrlMatching(url, handler[0]) ||
          isUrlMatching(combineUrls(baseURL, url), handler[0])) &&
        isBodyOrParametersMatching(method, body, parameters, handler[1]) &&
        isObjectMatching(headers, handler[2])
      );
    }
    if (handler[0] instanceof RegExp) {
      return (
        (handler[0].test(url) || handler[0].test(combineUrls(baseURL, url))) &&
        isBodyOrParametersMatching(method, body, parameters, handler[1]) &&
        isObjectMatching(headers, handler[2])
      );
    }
  });
}

export function isUrlMatching(url, required) {
  const noSlashUrl = url[0] === "/" ? url.substr(1) : url;
  const noSlashRequired = required[0] === "/" ? required.substr(1) : required;
  return noSlashUrl === noSlashRequired;
}

export function isBodyOrParametersMatching(method, body, parameters, required) {
  const allowedParamsMethods = ["delete", "get", "head", "options"];
  if (allowedParamsMethods.indexOf(method.toLowerCase()) >= 0) {
    const params = required ? required.params : undefined;
    return isObjectMatching(parameters, params);
  }
  return isBodyMatching(body, required);
}

export function isObjectMatching(actual, expected) {
  if (expected === undefined) return true;
  if (typeof expected.asymmetricMatch === "function") {
    return expected.asymmetricMatch(actual);
  }
  return isEqual(actual, expected);
}

export function isBodyMatching(body, requiredBody) {
  if (requiredBody === undefined) {
    return true;
  }
  let parsedBody;
  try {
    parsedBody = JSON.parse(body);
  } catch (e) {}

  return isObjectMatching(parsedBody || body, requiredBody);
}

export function purgeIfReplyOnce(mock, handler) {
  Object.keys(mock.handlers).forEach(function (key) {
    const index = mock.handlers[key].indexOf(handler);
    if (index > -1) {
      mock.handlers[key].splice(index, 1);
    }
  });
}

export function settle(resolve, reject, response, delay) {
  if (delay > 0) {
    setTimeout(function () {
      settle(resolve, reject, response);
    }, delay);
    return;
  }

  if (response.config && response.config.validateStatus) {
    response.config.validateStatus(response.status)
      ? resolve(response)
      : reject(
          createAxiosError(
            "Request failed with status code " + response.status,
            response.config,
            response
          )
        );
    return;
  }

  // Support for axios < 0.11
  if (response.status >= 200 && response.status < 300) {
    resolve(response);
  } else {
    reject(response);
  }
}

export function createAxiosError(message, config, response, code) {
  const error = new Error(message);
  error.isAxiosError = true;
  error.config = config;
  if (response !== undefined) {
    error.response = response;
  }
  if (code !== undefined) {
    error.code = code;
  }
  return error;
}

export function getRouteParams(knownRouteParams, routePattern, config) {
  const routeParams = {};
  let route = routePattern;

  if (knownRouteParams === null || typeof route !== "string") {
    return routeParams;
  }

  const paramsUsedInRoute = route.split("/").filter(function (param) {
    return knownRouteParams[param] !== undefined;
  });
  if (paramsUsedInRoute.length === 0) {
    return routeParams;
  }

  paramsUsedInRoute.forEach((param) => {
    route = route.replace(param, "(" + knownRouteParams[param] + ")");
  });

  const actualUrl = config.url;
  const routeMatches = actualUrl.match(new RegExp("^" + route + "$"));

  paramsUsedInRoute.forEach(function (param, index) {
    const paramNameMatches = param.match(/^:(.+)|{(.+)}$/) || [];
    const paramName = paramNameMatches[1] || paramNameMatches[2];
    if (paramName === undefined) {
      return;
    }

    routeParams[paramName] = routeMatches[index + 1];
  });

  return routeParams;
}
