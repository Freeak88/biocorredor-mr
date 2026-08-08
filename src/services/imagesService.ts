export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_ORIGINAL_IMAGE_BYTES = 50 * 1024 * 1024;
export const TARGET_IMAGE_BYTES = 500 * 1024;

export function validateImageFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new Error('El archivo seleccionado no es una imagen.');
  }
  if (file.size > MAX_ORIGINAL_IMAGE_BYTES) {
    throw new Error('La imagen es demasiado grande para procesarla. El limite es 50 MB.');
  }
}

export function validateCompressedImageFile(file: File): void {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('No se pudo comprimir la imagen por debajo de 5 MB.');
  }
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo comprimir la imagen.'));
    }, type, quality);
  });
}

export async function compressImage(file: File, targetBytes = TARGET_IMAGE_BYTES): Promise<File> {
  validateImageFile(file);
  if (file.size <= targetBytes) return file;

  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo preparar la compresion de imagen.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const outputType = 'image/jpeg';
  let quality = 0.82;
  let blob = await canvasToBlob(canvas, outputType, quality);

  while (blob.size > targetBytes && quality > 0.45) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, outputType, quality);
  }

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'biocorredor-mr';
  const compressedFile = new File([blob], `${baseName}.jpg`, { type: outputType, lastModified: Date.now() });
  validateCompressedImageFile(compressedFile);
  return compressedFile;
}

export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [meta, data] = dataUrl.split(',');
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || 'image/jpeg';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}
