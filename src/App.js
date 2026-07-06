import logo from './logo.svg';
import './App.css';
import Lottie, { useLottie } from 'lottie-react';
import animationJson from './assets/sticker/BananaAnimated_batch_tgs/0.json';
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
