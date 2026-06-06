import { PropsWithChildren } from 'react';
import './app.css';

function App({ children }: PropsWithChildren<object>) {
  // children is the page component rendered by Taro's router
  return <>{children}</>;
}

export default App;
