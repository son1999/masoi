import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ma Sói',
  description: 'Werewolves of Millers Hollow — online multiplayer',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function strip() {
                  document.querySelectorAll('[bis_skin_checked],[bis_register],[__processed_]')
                    .forEach(function(el){
                      el.removeAttribute('bis_skin_checked');
                      el.removeAttribute('bis_register');
                      Array.from(el.attributes)
                        .filter(function(a){ return a.name.indexOf('__processed_') === 0; })
                        .forEach(function(a){ el.removeAttribute(a.name); });
                    });
                }
                strip();
                if (document.readyState !== 'complete') {
                  document.addEventListener('DOMContentLoaded', strip);
                }
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
