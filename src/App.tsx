import ComingSoon from "./pages/ComingSoon";

/**
 * PRE-LAUNCH LOCK
 * ----------------
 * The product is not public yet. Every route is intentionally short-circuited
 * to the ComingSoon holding page, so no part of the real app is reachable.
 *
 * To go live: restore the full router from `src/App.full.tsx.bak`
 * (it contains the original providers + <Routes>), then redeploy.
 */
const App = () => <ComingSoon />;

export default App;
