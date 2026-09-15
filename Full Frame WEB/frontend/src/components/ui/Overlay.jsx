import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Image, Search, Download, CheckCircle, FolderArchive, Activity, Shield, Sun, Moon } from 'lucide-react';
import FAQ from './FAQ';

gsap.registerPlugin(ScrollTrigger);

const EXTENSION_URL = 'https://chromewebstore.google.com/detail/facebook-album-download-k/pfpifcnmbhnhjpoflkejkeeoaaiifggf';

export default function Overlay() {
  const overlayRef = useRef(null);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Animate steps
      gsap.to('.step', {
        y: 0,
        opacity: 1,
        stagger: 0.2,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.steps-section',
          start: 'top 75%',
        }
      });

      // Animate features
      gsap.to('.card', {
        y: 0,
        opacity: 1,
        stagger: 0.15,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.features-section',
          start: 'top 75%',
        }
      });
    }, overlayRef);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={overlayRef} style={{ position: 'relative', zIndex: 10 }}>
      {/* Navigation */}
      <nav>
        <div className="container nav-container">
          <a href="#" className="logo">
            <img src="/logo.png" alt="Full Frame Logo" style={{ height: '32px', width: 'auto' }} />
            Full Frame
          </a>
          <div className="nav-actions">
            <button 
              className="theme-toggle-btn" 
              onClick={toggleTheme} 
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <a 
              href={EXTENSION_URL}
              target="_blank"
              rel="noreferrer"
              className="btn"
              style={{ padding: '0.6rem 1.25rem', fontSize: '0.92rem' }}
            >
              Get Extension
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section text-center">
        <div className="container">
          <h1>Download your Facebook albums.<br />Full resolution. One click.</h1>
          <p className="mx-auto mb-8">
            Save any Facebook album you can already view — as separate files or one ZIP. Free. No account, no server, no catch.
          </p>
          <a href={EXTENSION_URL} target="_blank" rel="noreferrer" className="btn">
            Add to Chrome — it's free
          </a>
          <span className="trust-line">Works in Chrome & Edge 116+ · No sign-up</span>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="steps-section section-alt">
        <div className="container">
          <h2 className="text-center">How it works</h2>
          <div className="steps-container">
            <div className="step">
              <div className="step-icon"><Image size={32} /></div>
              <h3>1. Open an album</h3>
              <p className="mx-auto" style={{ fontSize: '1rem' }}>Open any Facebook album you can already view.</p>
            </div>
            <div className="step">
              <div className="step-icon"><Search size={32} /></div>
              <h3>2. Scan</h3>
              <p className="mx-auto" style={{ fontSize: '1rem' }}>Click the extension icon, then Scan. It finds every photo, even ones Facebook hasn't loaded yet.</p>
            </div>
            <div className="step">
              <div className="step-icon"><Download size={32} /></div>
              <h3>3. Download</h3>
              <p className="mx-auto" style={{ fontSize: '1rem' }}>Save as separate files or one ZIP — your choice.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid Section */}
      <section className="features-section">
        <div className="container">
          <h2 className="text-center">Everything you need</h2>
          <p className="text-center mx-auto">A powerful toolkit that runs entirely in your browser.</p>
          
          <div className="features-grid">
            <div className="card">
              <div className="card-icon"><CheckCircle size={24} /></div>
              <h3>Full resolution</h3>
              <p style={{ fontSize: '0.95rem' }}>Opens each photo to get the real file, not the cropped thumbnail.</p>
            </div>
            <div className="card">
              <div className="card-icon"><FolderArchive size={24} /></div>
              <h3>ZIP or files</h3>
              <p style={{ fontSize: '0.95rem' }}>Pack the whole album into one ZIP, or save photos individually.</p>
            </div>
            <div className="card">
              <div className="card-icon"><Search size={24} /></div>
              <h3>Nothing missed</h3>
              <p style={{ fontSize: '0.95rem' }}>Shows exactly how many photos were found vs. how many the album claims to have.</p>
            </div>
            <div className="card">
              <div className="card-icon"><Activity size={24} /></div>
              <h3>Automatic retry</h3>
              <p style={{ fontSize: '0.95rem' }}>If one image URL fails, it tries a fallback before giving up.</p>
            </div>
            <div className="card">
              <div className="card-icon"><Activity size={24} /></div>
              <h3>Your pace</h3>
              <p style={{ fontSize: '0.95rem' }}>Adjustable delay and concurrency so you don't get rate limited.</p>
            </div>
            <div className="card">
              <div className="card-icon"><Shield size={24} /></div>
              <h3>100% private</h3>
              <p style={{ fontSize: '0.95rem' }}>No account, no server, no analytics. Everything happens in your browser.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Privacy Section */}
      <section className="privacy-section section-alt">
        <div className="container" style={{ maxWidth: '800px' }}>
          <h2>Privacy & permissions</h2>
          <p className="mb-8" style={{ maxWidth: '100%' }}>
            This extension only runs on facebook.com and fbcdn.net. It never sends your data anywhere except back to Facebook's own servers to fetch the photos you asked for. There's no backend, no analytics, no tracking, no account required.
          </p>
          
          <table className="privacy-table">
            <thead>
              <tr>
                <th>Permission</th>
                <th>Why it's needed</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>downloads</strong></td>
                <td>To save images and ZIP files to your device.</td>
              </tr>
              <tr>
                <td><strong>storage</strong></td>
                <td>To remember your settings between sessions.</td>
              </tr>
              <tr>
                <td><strong>scripting</strong></td>
                <td>To scan the current Facebook page for images.</td>
              </tr>
              <tr>
                <td><strong>sidePanel</strong></td>
                <td>To display the extension UI next to your album.</td>
              </tr>
              <tr>
                <td><strong>host access</strong></td>
                <td>facebook.com and fbcdn.net to read and fetch photos.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="faq-section">
        <div className="container">
          <h2 className="text-center">Frequently asked questions</h2>
          <FAQ />
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="container">
          <div className="footer-links">
            <a href="https://github.com/LapaluLiyanage/Full-Frame" target="_blank" rel="noreferrer">GitHub Repo</a>
            <a href={EXTENSION_URL} target="_blank" rel="noreferrer">Chrome Web Store</a>
            <a href="https://full-frame.vercel.app/privacy.html">Privacy Policy</a>
            <a href="mailto:lapaluliyanage@gmail.com?subject=Full%20Frame%20-%20Issue%20Report">Report an issue</a>
          </div>
          <p className="disclaimer mx-auto">
            Made by <a href="https://github.com/LapaluLiyanage" target="_blank" rel="noreferrer">Lapalu Liyanage</a>. Not affiliated with or endorsed by Meta/Facebook.
          </p>
        </div>
      </footer>
    </div>
  );
}
