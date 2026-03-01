import './globals.css';
import { TopNav } from '../components/TopNav';
import { ThemeProvider } from '../components/theme';

export const metadata = {
  title: 'MCP Knowledge Hub',
  description: 'Search and manage indexed enterprise documentation.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <div className="appShell">
            <TopNav />
            <div className="container">{children}</div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
