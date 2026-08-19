import imageCompression from 'browser-image-compression';

// Section 5A of the master doc — a hard client-side cap on target photo
// uploads, so the Supabase free-tier storage bucket (1GB) and egress
// never take the hit; compression happens before anything hits the network.
export async function compressTargetImage(file) {
  const options = {
    maxSizeMB: 0.35, // 350KB cap
    maxWidthOrHeight: 1600, // still plenty of resolution for measuring bullet holes
    useWebWorker: true,
    fileType: 'image/webp',
  };
  try {
    return await imageCompression(file, options);
  } catch (error) {
    console.error('Image compression error:', error);
    return file; // fall back to the original file rather than blocking the user
  }
}

// Firearm profile photos are a small avatar-style image, not something
// anyone needs to zoom into for detail (unlike target photos, which get
// measured against) — a smaller cap keeps storage/egress down further.
export async function compressFirearmPhoto(file) {
  const options = {
    maxSizeMB: 0.25,
    maxWidthOrHeight: 1000,
    useWebWorker: true,
    fileType: 'image/webp',
  };
  try {
    return await imageCompression(file, options);
  } catch (error) {
    console.error('Image compression error:', error);
    return file;
  }
}
