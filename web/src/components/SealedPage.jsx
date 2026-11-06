import { useState } from 'react';

/* The sealed document is mounted same-origin, unchanged, so its CSS,
   scripts and behaviour stay the ones in the artefact. */
export default function SealedPage({ title, src }) {
  const [ready, setReady] = useState(false);
  return (
    <iframe
      className="seal"
      title={title}
      src={src}
      data-ready={ready ? '1' : '0'}
      onLoad={() => setReady(true)}
    />
  );
}
