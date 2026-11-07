import type { Metadata } from 'next';
import { Story } from '@/components/story/story';

export const metadata: Metadata = {
  title: 'How Zoro protects a tool call',
  description: 'Follow one MCP tool call through Zoro: fingerprint, Sentinel audit, quarantine, policy, Output Shield, Human Seal, the public Seal and a tamper-evident log.',
};

export default function StoryPage() {
  return <Story />;
}
