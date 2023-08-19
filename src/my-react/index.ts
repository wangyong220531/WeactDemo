import createElement from './createElement'; 
import render from './render';

export interface ElAttr {
  [key: string]: any
}

export interface ElProps {
  attrs?: ElAttr;
  children?: Array<El | string>;
}

type El = string | Function;

export { 
  createElement,
  render
};