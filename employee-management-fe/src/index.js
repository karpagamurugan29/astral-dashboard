import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './assets/css/premium.css';
import './components/common/Styles/styles.css'
import App from './App';
import reportWebVitals from './reportWebVitals';

// feather-icons' feather.replace() swaps <i data-feather> nodes for <svg> nodes directly in the
// DOM, outside React's control. When React later unmounts a component that held one of those
// icons, it tries to remove the original <i> node it created — but that node was already replaced
// by feather, so it's no longer where React expects it, and removeChild/insertBefore throw and
// crash the render. Make both tolerant of a node that's no longer actually attached where React
// thinks it is, instead of throwing.
const originalRemoveChild = Node.prototype.removeChild;
Node.prototype.removeChild = function (child) {
  if (child.parentNode !== this) {
    return child;
  }
  return originalRemoveChild.call(this, child);
};

const originalInsertBefore = Node.prototype.insertBefore;
Node.prototype.insertBefore = function (newNode, referenceNode) {
  if (referenceNode && referenceNode.parentNode !== this) {
    return this.appendChild(newNode);
  }
  return originalInsertBefore.call(this, newNode, referenceNode);
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
