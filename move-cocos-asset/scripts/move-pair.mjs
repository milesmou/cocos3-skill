import { rename } from 'node:fs/promises';

// Keep the resource and its metadata together, including when recovery fails.
export async function movePair(source, destination, renameFile = rename) {
  await renameFile(source, destination);
  try {
    await renameFile(`${source}.meta`, `${destination}.meta`);
  } catch (moveError) {
    try {
      await renameFile(destination, source);
    } catch (rollbackError) {
      throw new AggregateError([moveError, rollbackError],
        `Metadata move failed: ${moveError.message}; rollback failed: ${rollbackError.message}. ` +
        `Recovery required: resource remains at ${destination}; metadata remains at ${source}.meta. ` +
        'Verify these paths before retrying; do not import or delete either file.');
    }
    throw new Error(`Metadata move failed: ${moveError.message}; resource restored to ${source}; metadata remains at ${source}.meta.`, { cause: moveError });
  }
}
