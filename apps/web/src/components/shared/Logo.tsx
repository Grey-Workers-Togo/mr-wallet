import Image from 'next/image';
import { cn } from '@/lib/utils';

export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Image src="/logo-symbol.svg" alt="" width={size} height={size} priority />
      <span className="text-lg font-bold text-primary-dark">Mr Wallet</span>
    </div>
  );
}

export function LogoSymbolOnly({ size = 24, className }: { size?: number; className?: string }) {
  return <Image src="/logo-symbol.svg" alt="Mr Wallet" width={size} height={size} className={className} />;
}
