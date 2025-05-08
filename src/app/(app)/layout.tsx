import type { ReactNode } from 'react';
import { Header } from '@/components/interview-ace/header';
import { ThemeToggle } from '@/components/interview-ace/theme-toggle';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8">
        {children}
      </main>
      <footer className="py-4 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} InterviewAce. All rights reserved.</p>
      </footer>
    </div>
  );
}
