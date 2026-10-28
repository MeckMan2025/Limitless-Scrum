function LandingScreen({ onGetRadical, onTeamLogin, onRadicalRundown }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0B0F1A] via-[#101B3A] to-[#0B0F1A] flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl p-8 w-80 space-y-6 text-center">
        <img
          src={`${import.meta.env.BASE_URL}ScrumLogo.png`}
          alt="Scrum Logo"
          className="w-24 h-24 mx-auto rounded-2xl shadow-md"
        />
        <h1 className="text-2xl font-bold bg-gradient-to-r from-brand-blue-dark via-brand-silver-dark to-brand-yellow-dark bg-clip-text text-transparent">
          Limitless Scrum
        </h1>

        <button
          onClick={onGetRadical}
          className="w-full py-3 bg-brand-yellow hover:bg-brand-yellow-dark rounded-xl font-semibold text-gray-700 transition-colors text-lg"
        >
          Let's Go
        </button>

        {/* Team login is a local-only testing door — absent from the deployed
            site (import.meta.env.DEV is false in a production build). */}
        {import.meta.env.DEV && (
          <button
            onClick={onTeamLogin}
            className="w-full py-3 bg-brand-silver/40 hover:bg-brand-silver/60 rounded-xl font-semibold text-gray-700 transition-colors text-lg"
          >
            Team Login <span className="text-xs font-normal text-gray-500">(local only)</span>
          </button>
        )}

        <p className="text-xs text-gray-400">
          Scouts &amp; visitors, check us out below!
        </p>

        <button
          onClick={onRadicalRundown}
          className="w-full py-3 bg-brand-blue hover:bg-brand-blue-dark rounded-xl font-semibold text-gray-700 transition-colors text-lg"
        >
          About the Team
        </button>
      </div>
    </div>
  )
}

export default LandingScreen
