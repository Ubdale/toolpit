import { Container } from '@/components/layout/Container';
import { ToolCard } from '@/components/tool/ToolCard';
import { ButtonLink } from '@/components/ui/Button';
import { toolsIn } from '@/lib/tools';

export default function NotFound() {
  return (
    <Container className="py-20">
      <div className="max-w-2xl">
        <p className="font-display text-sm font-semibold text-accent">404</p>
        <h1 className="mt-3 text-title">That tool isn&rsquo;t in the pit</h1>
        <p className="mt-4 text-lg text-muted">
          The page you were after doesn&rsquo;t exist. Everything Toolpit does is listed on the
          homepage — and all of it still runs in your browser, with nothing uploaded.
        </p>
        <ButtonLink href="/" size="lg" className="mt-8">
          Browse the tools
        </ButtonLink>
      </div>

      <h2 className="mt-16 font-display text-heading">Ready to use right now</h2>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {toolsIn('pdf').map((tool) => (
          <ToolCard key={tool.href} tool={tool} />
        ))}
      </ul>
    </Container>
  );
}
