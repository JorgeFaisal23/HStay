const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

/**
 * Respuesta con la imagen guardada como data URL (comprobantes y fotos), o
 * 404 si no hay imagen válida. Las imágenes se sirven aparte para que las
 * listas no carguen cada foto.
 */
export function dataUrlResponse(dataUrl: string | null | undefined, notFound = "No se encontró la imagen.") {
  const match = dataUrl ? DATA_URL.exec(dataUrl) : null;
  if (!match) return new Response(notFound, { status: 404 });
  return new Response(Buffer.from(match[2], "base64"), {
    headers: {
      "Content-Type": match[1],
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
}
