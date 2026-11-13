const SOURCE_URL = "https://nculgrwlzjitggjcgbpp.supabase.co";
const objectPath = "hero/1794253302246-5nuyyc.webp";
const url = `${SOURCE_URL}/storage/v1/object/public/site-media/${objectPath.split("/").map(encodeURIComponent).join("/")}`;
const response = await fetch(url);
console.log("SOURCE_PUBLIC_OBJECT_HTTP", response.status);
console.log("CONTENT_TYPE", response.headers.get("content-type"));
console.log("CONTENT_LENGTH", response.headers.get("content-length"));
if (!response.ok) {
  console.log("BODY", (await response.text()).slice(0, 500));
  process.exitCode = 1;
} else {
  const data = await response.arrayBuffer();
  console.log("DOWNLOAD_OK_BYTES", data.byteLength);
}
