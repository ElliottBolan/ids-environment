import { useEffect, useState } from 'react';
import logo from './logo.svg';
import './App.css';

function App() {
  const [responseText, setResponseText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('http://localhost:5000/hello')
      .then((res) => res.text())
      .then((text) => {
        const plain = text.replace(/<[^>]+>/g, '');
        setResponseText(plain);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || String(err));
        setLoading(false);
      });
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>

        <div style={{ marginTop: 16 }}>
          {loading && <p>Loading response from /hello...</p>}
          {error && <p style={{ color: 'salmon' }}>Error: {error}</p>}
          {!loading && !error && (
            <p>Response from backend: <strong>{responseText}</strong></p>
          )}
        </div>

        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
