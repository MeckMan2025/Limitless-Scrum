import { useState, useRef, useCallback } from 'react'

function LoadingScreen({ onComplete, onMusicStart }) {
  const [isVisible, setIsVisible] = useState(true)
  const [isFading, setIsFading] = useState(false)
  const tappedRef = useRef(false)

  const startMusic = () => {
    const pref = localStorage.getItem('scrum-music-pref') || 'off'
    if (pref === 'off') return
    const SONG_MAP = { 'intro': `${import.meta.env.BASE_URL}intro.mp3`, 'radical-robotics': `${import.meta.env.BASE_URL}radical-robotics.mp3`, 'radical-theme': `${import.meta.env.BASE_URL}radical-theme.mp3` }
    let src
    if (pref === 'random' || !SONG_MAP[pref]) {
      const songs = Object.values(SONG_MAP)
      src = songs[Math.floor(Math.random() * songs.length)]
    } else { src = SONG_MAP[pref] }
    const audio = new Audio(src)
    audio.volume = 1
    audio.play().catch(() => {})
    onMusicStart(audio)
  }

  const finishLoading = useCallback(() => {
    setIsFading(true)
    setTimeout(() => { setIsVisible(false); onComplete() }, 600)
  }, [onComplete])

  const handleTap = () => {
    if (tappedRef.current) return
    tappedRef.current = true
    startMusic()
    finishLoading()
  }

  if (!isVisible) return null

  return (
    <div
      onClick={handleTap}
      className={`fixed inset-0 z-50 cursor-pointer overflow-hidden transition-opacity duration-[600ms] ${isFading ? 'opacity-0' : 'opacity-100'}`}
      style={{ background: 'linear-gradient(140deg, #0B0F1A 0%, #101B3A 52%, #0B0F1A 100%)' }}
    >
      <style>{`
        @keyframes reveal {
          0%   { opacity: 0; transform: scale(1.22); letter-spacing: .18em; filter: blur(8px); }
          60%  { opacity: 1; filter: blur(0); }
          100% { opacity: 1; transform: scale(1); letter-spacing: -.02em; filter: blur(0); }
        }
        @keyframes ombre { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
        @keyframes floaty { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @keyframes sweep { 0% { transform: translateX(-160%) skewX(-18deg); } 100% { transform: translateX(160%) skewX(-18deg); } }
        .pre { animation: fadeUp .9s ease .15s both; }
        .scrum {
          background: linear-gradient(100deg, #2F6FE4 0%, #F5C400 45%, #A9B2BF 90%, #2F6FE4 130%);
          background-size: 220% auto;
          -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;
          animation: reveal 1.2s cubic-bezier(.2,.8,.2,1) both, ombre 6s linear 1.2s infinite, floaty 5s ease-in-out 1.2s infinite;
          filter: drop-shadow(0 8px 22px rgba(244,163,181,.35));
          position: relative;
        }
        .shine { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
        .shine::after { content: ''; position: absolute; top: -20%; bottom: -20%; width: 40%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.6), transparent);
          animation: sweep 3s ease-in-out 1.6s infinite; }
        .sub { animation: fadeUp 1s ease 1.7s both; }
        .cta { animation: fadeUp 1s ease 2.2s both; }

        /* Bees. The thing that makes flight read as a bee is that it isn't
           smooth: quick darts, then a hover where it barely moves, then a
           sudden change of mind — and it overshoots and corrects rather than
           arriving neatly. So the keyframes are spaced unevenly, each dart is
           linear and each arrival eases out, and the two bees fly different
           paths instead of the same one at different speeds. */
        @keyframes beeFly {
          0%   { transform: translate(-14vw, 64vh) rotate(10deg) scale(.8);  opacity: 0; animation-timing-function: ease-out; }
          7%   { transform: translate(4vw, 52vh)   rotate(-4deg) scale(.9);  opacity: 1; animation-timing-function: linear; }
          13%  { transform: translate(16vw, 33vh)  rotate(-12deg) scale(1);  animation-timing-function: ease-out; }
          17%  { transform: translate(19vw, 30vh)  rotate(2deg)  scale(1); }   /* overshoot, then hang */
          24%  { transform: translate(18vw, 31vh)  rotate(-2deg) scale(1); animation-timing-function: linear; }
          32%  { transform: translate(39vw, 47vh)  rotate(9deg)  scale(1.05); animation-timing-function: ease-out; }
          36%  { transform: translate(41vw, 49vh)  rotate(3deg)  scale(1.05); }
          43%  { transform: translate(40vw, 48vh)  rotate(-3deg) scale(1.04); animation-timing-function: linear; }
          51%  { transform: translate(58vw, 26vh)  rotate(-11deg) scale(.98); animation-timing-function: ease-out; }
          56%  { transform: translate(57vw, 24vh)  rotate(4deg)  scale(.98); }
          64%  { transform: translate(59vw, 25vh)  rotate(-2deg) scale(1); animation-timing-function: linear; }
          74%  { transform: translate(80vw, 44vh)  rotate(8deg)  scale(1); animation-timing-function: ease-out; }
          79%  { transform: translate(82vw, 42vh)  rotate(-4deg) scale(.98); animation-timing-function: linear; }
          93%  { transform: translate(106vw, 31vh) rotate(5deg)  scale(.88); opacity: 1; }
          100% { transform: translate(120vw, 28vh) rotate(0deg)  scale(.82); opacity: 0; }
        }
        @keyframes beeFly2 {
          0%   { transform: translate(-10vw, 22vh) rotate(-8deg) scale(.7); opacity: 0; animation-timing-function: linear; }
          9%   { transform: translate(10vw, 30vh)  rotate(6deg)  scale(.78); opacity: .75; animation-timing-function: ease-out; }
          15%  { transform: translate(13vw, 33vh)  rotate(-3deg) scale(.8); }
          23%  { transform: translate(12vw, 32vh)  rotate(2deg)  scale(.8); animation-timing-function: linear; }
          34%  { transform: translate(34vw, 18vh)  rotate(-10deg) scale(.76); animation-timing-function: ease-out; }
          39%  { transform: translate(36vw, 16vh)  rotate(3deg)  scale(.76); animation-timing-function: linear; }
          50%  { transform: translate(55vw, 38vh)  rotate(11deg) scale(.82); animation-timing-function: ease-out; }
          55%  { transform: translate(54vw, 40vh)  rotate(-2deg) scale(.82); }
          63%  { transform: translate(56vw, 39vh)  rotate(4deg)  scale(.8); animation-timing-function: linear; }
          76%  { transform: translate(78vw, 20vh)  rotate(-9deg) scale(.76); animation-timing-function: ease-out; }
          81%  { transform: translate(80vw, 22vh)  rotate(2deg)  scale(.76); animation-timing-function: linear; }
          94%  { transform: translate(108vw, 34vh) rotate(6deg)  scale(.7); opacity: .75; }
          100% { transform: translate(120vw, 32vh) rotate(0deg)  scale(.68); opacity: 0; }
        }
        /* Wingbeat: small and fast, or it reads as bobbing rather than flying. */
        @keyframes buzz { 0%,100% { translate: 0 0; } 50% { translate: .4px -1.6px; } }

        .bee {
          position: absolute; top: 0; left: 0; pointer-events: none;
          font-size: clamp(24px, 4.5vw, 44px); line-height: 1;
          animation: beeFly 13s linear .4s infinite;
          will-change: transform;
        }
        .bee span { display: inline-block; animation: buzz .12s linear infinite; }
        .bee.two { animation-name: beeFly2; animation-duration: 16s; animation-delay: 5s; }

        /* Someone who asked the OS for less motion gets a bee that sits still. */
        @media (prefers-reduced-motion: reduce) {
          .bee { animation: none; transform: translate(8vw, 26vh); }
          .bee.two { transform: translate(72vw, 20vh); }
          .bee span { animation: none; }
        }
      `}</style>

      <div className="relative h-full flex flex-col items-center justify-center px-6 text-center">
        <i className="bee" aria-hidden="true"><span>🐝</span></i>
        <i className="bee two" aria-hidden="true"><span>🐝</span></i>

        <p className="pre text-gray-400 tracking-[0.5em] text-xs sm:text-sm font-bold uppercase mb-2 ml-[0.5em]">
          Everything That's
        </p>

        <h1 className="scrum text-[20vw] sm:text-9xl font-black leading-none">
          SCRUM
          <span className="shine" />
        </h1>

        <p className="sub text-gray-400 tracking-[0.3em] text-xs sm:text-sm font-bold uppercase mt-4">
          Limitless Scrum · FRC
        </p>

        <div className="cta absolute bottom-14 left-1/2 -translate-x-1/2">
          <span className="text-sm font-bold text-white tracking-widest uppercase px-7 py-3 rounded-full shadow-lg animate-pulse"
                style={{ background: 'linear-gradient(90deg, #2F6FE4, #F5C400, #A9B2BF)' }}>
            Tap to enter
          </span>
        </div>
      </div>
    </div>
  )
}

export default LoadingScreen
