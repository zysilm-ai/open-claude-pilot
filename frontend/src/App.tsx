import { Routes, Route } from 'react-router-dom';
import ProjectList from './components/ProjectList/ProjectList';
import ProjectSession from './components/ProjectSession/ProjectSession';
import './App.css';

function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<ProjectList />} />
        <Route path="/project/:projectId" element={<ProjectSession />} />
      </Routes>
    </div>
  );
}

export default App;
