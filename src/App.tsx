import { useMemo } from 'react';
import EditorComponent from './components/Editor';
import WordCount from './components/WordCount';
import { useFile } from './hooks/useFile';
import './App.css';

function App() {
  const { content, updateContent } = useFile();

  const charCount = useMemo(() => {
    return content.replace(/\s/g, '').length;
  }, [content]);

  return (
    <div className="app">
      <div className="editor-container">
        <div className="editor-wrapper">
          <EditorComponent onChange={updateContent} />
        </div>
      </div>
      <WordCount count={charCount} />
    </div>
  );
}

export default App;
