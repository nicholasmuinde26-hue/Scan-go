import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useTopInset, useBottomInset } from '../../../core/safeArea';
import { useCreateTicket, useSendTicketMessage, useSupportTickets } from '../hooks';
import type { SupportTicket } from '../types';
import { notify } from '../../../shared/ui/feedback';

const TONE: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: '#FFFBEB', text: '#92400E' },
  IN_PROGRESS: { bg: '#EFF6FF', text: '#1E40AF' },
  RESOLVED: { bg: '#ECFDF5', text: '#065F46' },
  CLOSED: { bg: '#F1F5F9', text: '#475569' },
};

export default function Support() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [show, setShow] = useState(!!orderId);
  const [selectedId, setSelectedId] = useState('');
  const [reply, setReply] = useState('');
  const listRef = useRef<FlatList>(null);

  const ticketsQuery = useSupportTickets();
  const createMutation = useCreateTicket();
  const sendMessage = useSendTicketMessage();
  const tickets = ticketsQuery.data?.tickets || [];
  const selected = tickets.find((t) => t._id === selectedId) || null;

  const topPadding = useTopInset(12);
  const bottomPadding = useBottomInset(32);
  const replyBarPadding = useBottomInset(8);

  useEffect(() => {
    if (selected?.messages?.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
    }
  }, [selected?.messages?.length, selectedId]);

  const create = async () => {
    try {
      const res = await createMutation.mutateAsync({ subject, description, orderId });
      notify('Support request sent. We will reply as soon as possible.', 'info');
      setSubject('');
      setDescription('');
      setShow(false);
      if (res?.ticket?._id) setSelectedId(res.ticket._id);
    } catch (e) {
      notify(`Could not send request: ${e instanceof Error ? e.message : 'Please try again.'}`, 'error');
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim() || sendMessage.isPending) return;
    try {
      await sendMessage.mutateAsync({ ticketId: selected._id, message: reply.trim() });
      setReply('');
    } catch (e) {
      notify(`Could not send message: ${e instanceof Error ? e.message : 'Please try again.'}`, 'error');
    }
  };

  // ---- Thread view ----
  if (selected) {
    const tone = TONE[selected.status] || TONE.CLOSED;
    return (
      <View style={[s.page, { paddingTop: topPadding }]}>
        <View style={s.threadHeader}>
          <Pressable onPress={() => setSelectedId('')} style={s.backBtn}>
            <Text style={s.back}>‹  All tickets</Text>
          </Pressable>
          <Text style={s.threadNumber}>{selected.ticketNumber}</Text>
          <Text style={s.threadSubject}>{selected.subject}</Text>
          <View style={[s.statusPill, { backgroundColor: tone.bg }]}>
            <Text style={[s.statusText, { color: tone.text }]}>{selected.status.replace(/_/g, ' ')}</Text>
          </View>
        </View>

        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          data={selected.messages || []}
          keyExtractor={(_, i) => String(i)}
          ListEmptyComponent={<Text style={s.emptyThread}>No messages yet.</Text>}
          renderItem={({ item }) => {
            const mine = item.senderRole === 'CUSTOMER' || item.sender === 'CUSTOMER';
            return (
              <View style={[s.bubbleWrap, mine ? s.bubbleWrapMine : s.bubbleWrapTheirs]}>
                <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleTheirs]}>
                  {!mine && <Text style={s.bubbleSender}>{item.sender === 'STAFF' || item.senderRole === 'STAFF' ? 'Support team' : item.sender}</Text>}
                  <Text style={[s.bubbleText, mine && { color: '#fff' }]}>{item.message}</Text>
                  <Text style={[s.bubbleTime, mine && { color: 'rgba(255,255,255,0.75)' }]}>
                    {new Date(item.createdAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}
                  </Text>
                </View>
              </View>
            );
          }}
        />

        <View style={[s.replyBar, { paddingBottom: replyBarPadding }]}>
          <TextInput
            value={reply}
            onChangeText={setReply}
            placeholder="Write a reply…"
            placeholderTextColor="#94A3B8"
            multiline
            style={s.replyInput}
          />
          <Pressable style={[s.replyBtn, (!reply.trim() || sendMessage.isPending) && { opacity: 0.6 }]} disabled={!reply.trim() || sendMessage.isPending} onPress={sendReply}>
            <Text style={s.replyBtnText}>Send</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- Ticket list ----
  return (
    <ScrollView style={s.page} contentContainerStyle={[s.content, { paddingTop: topPadding, paddingBottom: bottomPadding }]}>
      <Pressable onPress={() => router.back()} style={s.backBtn}>
        <Text style={s.back}>‹  Back</Text>
      </Pressable>
      <Text style={s.heading}>Help & support</Text>
      <Text style={s.sub}>Your support requests and replies.</Text>
      <Pressable style={s.button} onPress={() => setShow(!show)}>
        <Text style={s.buttonText}>{show ? 'Close form' : 'Create a support request'}</Text>
      </Pressable>
      {show && (
        <View style={s.form}>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="What do you need help with?"
            style={s.input}
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Describe the issue (at least 10 characters)"
            multiline
            style={[s.input, s.multiline]}
          />
          <Pressable style={s.send} onPress={create} disabled={createMutation.isPending}>
            <Text style={s.buttonText}>{createMutation.isPending ? 'Sending…' : 'Send request'}</Text>
          </Pressable>
        </View>
      )}
      {(ticketsQuery.data?.tickets || []).map((t: SupportTicket, i: number) => {
        const tone = TONE[t.status] || TONE.CLOSED;
        const last = t.messages?.[t.messages.length - 1];
        return (
          <Pressable key={t._id || i} style={s.ticket} onPress={() => setSelectedId(t._id)}>
            <View style={s.ticketTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={1}>
                  {t.subject}
                </Text>
                <Text style={s.sub}>
                  {t.ticketNumber} · {t.messages?.length || 0} messages · {new Date(t.updatedAt || Date.now()).toLocaleDateString()}
                </Text>
              </View>
              <View style={[s.statusPill, { backgroundColor: tone.bg }]}>
                <Text style={[s.statusText, { color: tone.text }]}>{t.status.replace(/_/g, ' ')}</Text>
              </View>
            </View>
            {last && (
              <Text style={s.preview} numberOfLines={2}>
                {last.sender === 'STAFF' || last.senderRole === 'STAFF' ? 'Support: ' : ''}{last.message}
              </Text>
            )}
            <Text style={s.openThread}>Open thread →</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f7f5' },
  content: { paddingHorizontal: 22 },
  backBtn: { paddingVertical: 6, alignSelf: 'flex-start' },
  back: { color: '#16A34A', fontWeight: '700', fontSize: 16 },
  heading: { fontSize: 28, fontWeight: '800', color: '#19281f', marginTop: 14 },
  sub: { fontSize: 13, color: '#77837b', marginTop: 4 },
  button: { height: 49, backgroundColor: '#16A34A', borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  buttonText: { color: '#fff', fontWeight: '800' },
  form: { backgroundColor: '#fff', padding: 15, borderRadius: 15, marginTop: 10 },
  input: { height: 50, backgroundColor: '#f5f7f5', borderRadius: 11, paddingHorizontal: 14, marginTop: 9, color: '#0F172A' },
  multiline: { height: 110, textAlignVertical: 'top', paddingVertical: 12 },
  send: { height: 47, backgroundColor: '#16A34A', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  ticket: { backgroundColor: '#fff', padding: 15, borderRadius: 15, marginTop: 10 },
  ticketTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontWeight: '800', color: '#27372e', fontSize: 15 },
  preview: { color: '#64748B', fontSize: 13, marginTop: 8, lineHeight: 18 },
  openThread: { color: '#16A34A', fontWeight: '800', fontSize: 12, marginTop: 10 },
  statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  threadHeader: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 12 },
  threadNumber: { fontSize: 11, color: '#94A3B8', fontFamily: 'monospace', marginTop: 2 },
  threadSubject: { fontSize: 20, fontWeight: '800', color: '#19281f', marginTop: 4 },
  emptyThread: { color: '#94A3B8', textAlign: 'center', marginTop: 40 },
  bubbleWrap: { flexDirection: 'row', marginVertical: 4 },
  bubbleWrapMine: { justifyContent: 'flex-end' },
  bubbleWrapTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: 16, padding: 12 },
  bubbleMine: { backgroundColor: '#16A34A', borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', borderBottomLeftRadius: 4 },
  bubbleSender: { fontSize: 10, fontWeight: '800', color: '#16A34A', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  bubbleText: { fontSize: 14, color: '#0F172A', lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: '#94A3B8', marginTop: 6, alignSelf: 'flex-end' },
  replyBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 10, backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#E2E8F0' },
  replyInput: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 11, fontSize: 14, color: '#0F172A', maxHeight: 110 },
  replyBtn: { backgroundColor: '#16A34A', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 11 },
  replyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
