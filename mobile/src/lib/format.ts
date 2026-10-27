import type { OrderStatus, Ticket } from './types';

export const money = (value: number | string | null | undefined) => `$${Number(value ?? 0).toFixed(2)}`;

export function shortDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });
}

export function dateTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
  });
}

export function timeAgo(iso: string | null) {
  if (!iso) return '';
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours > 1 ? 's' : ''} ago`;
  return shortDate(iso);
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'On the way',
  delivered: 'Completed',
  cancelled: 'Cancelled',
};

export const STATUS_COLOR: Record<OrderStatus, string> = {
  pending: '#E8C77A',
  confirmed: '#9DB8E8',
  preparing: '#E7A86B',
  ready: '#8FC79B',
  out_for_delivery: '#C3A6E8',
  delivered: '#8FC79B',
  cancelled: '#EE8E7A',
};

export const greeting = () => {
  const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Chicago' }));
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

export const TICKET_COLOR: Record<Ticket['status'], string> = {
  open: '#9DB8E8',
  in_progress: '#E7A86B',
  resolved: '#8FC79B',
  closed: 'rgba(245,237,227,0.5)',
};
