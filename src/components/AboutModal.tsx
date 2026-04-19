interface AboutModalProps {
  onClose: () => void;
}

export function AboutModal({ onClose }: AboutModalProps) {
  return (
    <>
      <div className="about-backdrop" onClick={onClose} />
      <div className="about-modal" role="dialog" aria-labelledby="about-title">
        <button className="about-close" onClick={onClose} aria-label="Fermer">
          ×
        </button>
        <h2 id="about-title" className="about-title">Siegfried</h2>
        <p className="about-version">v0.1.0 — Anonymiseur de documents 100 % local</p>
        <div className="about-signature">
          <p className="about-author">Marc Sztulman</p>
          <p className="about-tagline">vous simplifie la vie.</p>
        </div>
        <div className="about-links">
          <a
            href="https://github.com/0Janvier/siegfried"
            target="_blank"
            rel="noreferrer"
          >
            github.com/0Janvier/siegfried
          </a>
          <span className="about-sep">·</span>
          <span>Apache License 2.0</span>
        </div>
      </div>
    </>
  );
}
