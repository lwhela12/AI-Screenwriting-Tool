/**
 * Word documents (.docx) as plain prose, for treatments. mammoth is loaded on
 * demand so it stays out of the main bundle; it separates paragraphs with a
 * blank line and drops the formatting.
 */
export async function docxToText(data: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  // The browser build reads `arrayBuffer`, the Node build (tests) reads `buffer`.
  const input = { arrayBuffer: data, buffer: data } as unknown as Parameters<typeof mammoth.extractRawText>[0];
  const result = await mammoth.extractRawText(input);
  return result.value.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
