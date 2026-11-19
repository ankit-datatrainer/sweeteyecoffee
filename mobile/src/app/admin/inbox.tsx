import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, View } from 'react-native';
import { useStaffOnly } from '@/components/admin';
import { PageScreen } from '@/components/layout';
import { toast } from '@/components/toast';
import { Button, Card, Chip, Field, Notice, T } from '@/components/ui';
import { errorMessage, get, patch } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { Ticket } from '@/lib/types';

type StaffTicket = Ticket & { customer_name: string; customer_email: string };
type ContactMessage = { id: number; name: string; email: string; phone: string | null; message: string; is_read: boolean; created_at: string };
type InboxItem = { kind: 'tickets'; row: StaffTicket } | { kind: 'contact'; row: ContactMessage };
const STATUS: Record<Ticket['status'], string> = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' };

export default function AdminInbox() {
  const staff = useStaffOnly();
  const [tab, setTab] = useState<InboxItem['kind']>('tickets');
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (before?: number, signal?: AbortSignal) => {
    const suffix = before ? `?before=${before}` : '';
    setError('');
    try {
      const next: InboxItem[] = tab === 'tickets'
        ? (await get<{ tickets: StaffTicket[] }>(`/admin/tickets${suffix}`, { signal })).tickets.map((row) => ({ kind: 'tickets', row }))
        : (await get<{ messages: ContactMessage[] }>(`/admin/contact-messages${suffix}`, { signal })).messages.map((row) => ({ kind: 'contact', row }));
      if (signal?.aborted) return;
      setItems((current) => before ? [...(current ?? []), ...next] : next);
      setHasMore(next.length === 50);
    } catch (e) {
      if (!signal?.aborted) setError(errorMessage(e));
    }
  }, [tab]);

  useFocusEffect(useCallback(() => {
    if (!staff) return;
    const controller = new AbortController();
    void load(undefined, controller.signal);
    return () => controller.abort();
  }, [load, staff]));

  const open = async (item: InboxItem) => {
    setSelected(item);
    if (item.kind === 'tickets' || item.row.is_read) return;
    try {
      await patch(`/admin/contact-messages/${item.row.id}/read`, {});
      const read: InboxItem = { ...item, row: { ...item.row, is_read: true } };
      setItems((current) => current?.map((entry) => entry === item ? read : entry) ?? null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (!staff) return null;

  return (
    <PageScreen title="Support inbox" contentStyle={{ maxWidth: 760 }}>
      {selected ? (
        <View style={{ gap: 12 }}>
          <Button title="Back to inbox" icon="arrow-left" variant="outline" size="md" onPress={() => setSelected(null)} />
          {selected.kind === 'tickets' ? (
            <TicketReply ticket={selected.row} onSave={(row) => {
              const updated: InboxItem = { kind: 'tickets', row };
              setSelected((shown) => shown === selected ? updated : shown);
              setItems((entries) => entries?.map((entry) => entry.kind === 'tickets' && entry.row.id === row.id ? updated : entry) ?? null);
            }} />
          ) : (
            <Card style={{ gap: 10 }}>
              <T variant="heading">{selected.row.name}</T>
              <T variant="small">{selected.row.email}{selected.row.phone ? ` · ${selected.row.phone}` : ''}</T>
              <T variant="body">{selected.row.message}</T>
              <Button title="Reply by email" icon="mail" onPress={() => {
                void Linking.openURL(`mailto:${encodeURIComponent(selected.row.email)}`).catch((e) => toast.error(errorMessage(e)));
              }} />
            </Card>
          )}
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(['tickets', 'contact'] as const).map((kind) => (
              <Chip key={kind} label={kind === 'tickets' ? 'Support tickets' : 'Contact messages'} selected={kind === tab} onPress={() => {
                if (tab === kind || busy) return;
                setItems(null);
                setTab(kind);
              }} />
            ))}
          </View>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {error && !items && <Button title="Try again" variant="outline" onPress={() => void load()} />}
          {!items && !error && <Notice>Loading the inbox…</Notice>}
          {items?.length === 0 && <Notice>No messages yet.</Notice>}
          {items?.map((item) => (
            <Card key={item.row.id} style={{ gap: 4 }}>
              <T variant="heading">{item.kind === 'tickets' ? item.row.subject : item.row.name}</T>
              <T variant="small">
                {item.kind === 'tickets' ? `${item.row.ticket_number} · ${STATUS[item.row.status]} · ${item.row.customer_name}` : item.row.is_read ? 'Read' : 'Unread'}
                {` · ${timeAgo(item.row.created_at)}`}
              </T>
              <Button title={item.kind === 'tickets' ? 'View ticket' : 'View message'} variant="outline" size="md" onPress={() => void open(item)} />
            </Card>
          ))}
          {items?.length && hasMore ? <Button title="Load older messages" loading={busy} onPress={async () => {
            setBusy(true);
            await load(items[items.length - 1].row.id);
            setBusy(false);
          }} /> : null}
        </View>
      )}
    </PageScreen>
  );
}

function TicketReply({ ticket, onSave }: { ticket: StaffTicket; onSave: (ticket: StaffTicket) => void }) {
  const [status, setStatus] = useState(ticket.status);
  const [response, setResponse] = useState(ticket.admin_response ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await patch(`/admin/tickets/${ticket.id}`, { status, admin_response: response });
      onSave({ ...ticket, status, admin_response: response.trim() });
      toast.success('Response saved to the customer’s ticket.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <T variant="heading">{ticket.subject}</T>
      <T variant="small">{ticket.ticket_number} · {ticket.customer_name} · {ticket.customer_email}</T>
      <T variant="body">{ticket.message}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(Object.keys(STATUS) as Ticket['status'][]).map((key) => <Chip key={key} label={STATUS[key]} selected={status === key} onPress={() => setStatus(key)} />)}
      </View>
      <Field label="Reply to the customer" value={response} onChangeText={setResponse} multiline maxLength={5000} />
      <Button title="Save response" loading={busy} disabled={!response.trim()} onPress={save} />
    </Card>
  );
}
