import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import History from "@/pages/history";
import Stats from "@/pages/stats";
import { UnsavedDraftProvider } from "@/context/unsaved-draft-context";
import { useGetStartupStatus } from "@workspace/api-client-react";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/history" component={History} />
      <Route path="/stats" component={Stats} />
      <Route component={NotFound} />
    </Switch>
  );
}

function MigrationFailureBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { data } = useGetStartupStatus({});

  if (!data?.migrationFailed || dismissed) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 p-3">
      <Alert variant="destructive" className="flex items-start justify-between gap-2 shadow-lg">
        <div>
          <AlertTitle>Startup migration failed</AlertTitle>
          <AlertDescription>
            The KB URL migration did not complete on startup. Some tickets may
            be missing source URL metadata. Check the server logs for details.
          </AlertDescription>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 text-destructive hover:opacity-70 transition-opacity text-lg leading-none"
          aria-label="Dismiss"
        >
          ×
        </button>
      </Alert>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <UnsavedDraftProvider>
          <MigrationFailureBanner />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </UnsavedDraftProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
