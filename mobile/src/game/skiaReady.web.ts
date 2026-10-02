import { useEffect, useState } from 'react';

/** Web preview: CanvasKit (wasm) must be loaded before any Skia <Canvas> renders. */
export function useSkiaReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    import('@shopify/react-native-skia/lib/module/web').then(({ LoadSkiaWeb }) => LoadSkiaWeb({ locateFile: (f: string) => `/${f}` })).then(() => alive && setReady(true)).catch((e) => console.error('CanvasKit failed to load', e));
    return () => { alive = false; };
  }, []);
  return ready;
}
