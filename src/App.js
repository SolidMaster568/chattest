import logo from './logo.svg';
import './App.css';
import Lottie, { useLottie } from 'lottie-react';
import animationJson from './1.json';
import Earth from './Earth';

function App() {
  const lottieOptions = {
    animationData: animationJson,
    loop: true,
  };
  const { View } = useLottie(lottieOptions);
  return (
    <div className="App">
        <Earth />
        {/* <Lottie animationData={animationJson} loop={true} />
        {View} */}
    </div>
  );
}

export default App;
