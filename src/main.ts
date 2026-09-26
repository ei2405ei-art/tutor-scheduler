import './styles.css';
import { AppStore } from './app/store.js';
import { mountApp } from './ui/app.js';
import { qs } from './ui/dom.js';

const root = qs<HTMLElement>('#app');
if (root) {
  mountApp(root, new AppStore());
}
