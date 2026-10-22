import { loadImageFile, resizeToBlob, uploadPhotoWithThumb, newPhotoName } from './photos'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Where notebook photos live. Entries made before this hold the image inline as
// a data: URL, and both still render: the <img> only ever sees a src.
export const NOTEBOOK_PHOTO_BUCKET = 'notebook-photos'

export const PHOTO_TOO_BIG = 'That photo is over 10 MB. Try a smaller one.'
export const PHOTO_CANT_READ = "Couldn't read that photo. If it came from an iPhone it may be HEIC. Open it, screenshot it, and add the screenshot, or use the project link instead."

// A picked photo, turned into the URL an entry stores. Shared by the typed
// form and the EN Helper, so a photo goes up the same way from both.
//
// The photo goes to storage with a small thumbnail beside it (sizes and why
// are in lib/photos.js). If the bucket is missing, the upload is refused or it
// times out, it is kept inline instead, but smaller, since it rides along with
// every notebook read: nobody is blocked on it. Rejects with a message fit to
// show the student when the browser can't read the file at all.
export async function uploadNotebookPhoto(file) {
  if (file.size > 10 * 1024 * 1024) throw new Error(PHOTO_TOO_BIG)
  let img
  try { img = await loadImageFile(file) } catch { throw new Error(PHOTO_CANT_READ) }
  try {
    return await uploadPhotoWithThumb(supabaseUrl, supabaseKey, NOTEBOOK_PHOTO_BUCKET, img, newPhotoName())
  } catch (err) {
    console.error('Photo upload failed, keeping it inline:', err.message)
    const blob = await resizeToBlob(img, { max: 1024, quality: 0.7 }).catch(() => null)
    if (!blob) throw new Error(PHOTO_CANT_READ)
    return await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = () => reject(new Error(PHOTO_CANT_READ))
      r.readAsDataURL(blob)
    })
  }
}
