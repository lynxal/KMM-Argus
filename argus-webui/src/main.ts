import './styles/globals.css';
import { mountApp } from './app';

const root = document.getElementById('app');
if (!root) {
  throw new Error('missing #app root element');
}

mountApp(root);

if (new URLSearchParams(window.location.search).get('perf') === '1') {
  void import('./dev/perf').then(({ runPerfHarness }) => runPerfHarness());
}
