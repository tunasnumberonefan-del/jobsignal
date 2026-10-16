import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Footer } from './components/layout/Footer';
import { Header } from './components/layout/Header';
import { Skeleton } from './components/ui/misc';
import { Landing } from './pages/Landing';
import { CheckPage } from './pages/CheckPage';
import { ReportPage } from './pages/ReportPage';
import { SignIn, AuthVerify } from './pages/Auth';
import { Pricing } from './pages/Pricing';
import { NotFound } from './pages/NotFound';

// Less-visited pages load on demand to keep the first page light.
const CompanyPage = lazy(() => import('./pages/CompanyPage'));
const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const HistoryPage = lazy(() => import('./pages/app/History'));
const SavedPage = lazy(() => import('./pages/app/Saved'));
const WatchlistPage = lazy(() => import('./pages/app/Watchlist'));
const ComparePage = lazy(() => import('./pages/app/Compare'));
const NotificationsPage = lazy(() => import('./pages/app/Notifications'));
const AccountPage = lazy(() => import('./pages/app/Account'));
const DevCheckout = lazy(() => import('./pages/app/DevCheckout'));
const AdminPage = lazy(() => import('./pages/admin/Admin'));
const HowItWorks = lazy(() => import('./pages/content/HowItWorks'));
const Methodology = lazy(() => import('./pages/content/Methodology'));
const Guides = lazy(() => import('./pages/content/Guides'));
const GuidePage = lazy(() => import('./pages/content/Guide'));
const Faq = lazy(() => import('./pages/content/Faq'));
const Privacy = lazy(() => import('./pages/content/Privacy'));
const Terms = lazy(() => import('./pages/content/Terms'));
const ReportProblem = lazy(() => import('./pages/content/ReportProblem'));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function PageFallback() {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-12 sm:px-6" aria-busy>
      <Skeleton className="h-10 w-72" />
      <Skeleton className="mt-6 h-4 w-full max-w-[560px]" />
      <Skeleton className="mt-3 h-4 w-full max-w-[480px]" />
      <Skeleton className="mt-10 h-48 w-full" />
    </div>
  );
}

export function App() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-raised focus:px-3 focus:py-2">Skip to content</a>
      <ScrollToTop />
      <Header />
      <div className="flex-1">
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/check" element={<CheckPage />} />
            <Route path="/r/:slug" element={<ReportPage />} />
            <Route path="/companies/:slug" element={<CompanyPage />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/auth/verify" element={<AuthVerify />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/saved" element={<SavedPage />} />
            <Route path="/watchlist" element={<WatchlistPage />} />
            <Route path="/compare" element={<ComparePage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/account/:tab" element={<AccountPage />} />
            <Route path="/billing/dev-checkout" element={<DevCheckout />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/:section" element={<AdminPage />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="/guides" element={<Guides />} />
            <Route path="/guides/:slug" element={<GuidePage />} />
            <Route path="/faq" element={<Faq />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/report-a-problem" element={<ReportProblem />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </div>
      <Footer />
    </div>
  );
}
