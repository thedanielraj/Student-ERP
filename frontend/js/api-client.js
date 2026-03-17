import { TOKEN_KEY } from "./config.js";
import { handleApiError } from "./errors.js";
import { showHome } from "./auth.js";

export async function authFetch(url, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = options.headers || {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const suppressAutoHome = Boolean(options.suppressAutoHome);
  const autoHandleError = Boolean(options.autoHandleError);
  const errorMessage = options.errorMessage || "Request failed.";
  const reqOptions = { ...options, headers };
  delete reqOptions.suppressAutoHome;
  delete reqOptions.autoHandleError;
  delete reqOptions.errorMessage;

  try {
    const res = await fetch(url, reqOptions);
    if (!res.ok && autoHandleError) {
      await handleApiError(res, errorMessage);
    }
    if (res.status === 401) {
      if (!suppressAutoHome) {
        showHome();
      }
    }
    return res;
  } catch (err) {
    if (autoHandleError) {
      alert(errorMessage);
    }
    throw err;
  }
}
