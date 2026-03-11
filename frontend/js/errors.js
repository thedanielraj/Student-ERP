export async function handleApiError(res, fallback = "Request failed") {
  if (res.ok) return true;
  let detail = fallback;
  try {
    const data = await res.clone().json();
    detail = data.detail || data.message || fallback;
  } catch (_) {
    // no-op
  }
  alert(detail);
  return false;
}
