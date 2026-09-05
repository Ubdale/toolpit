'use client';

import { useMemo, useState } from 'react';

import { ToolSectionHeading, ToolSurface } from '@/components/tool/ToolSurface';
import { Checkbox } from '@/components/ui/Choice';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { CopyButton } from '@/components/ui/CopyButton';
import { ErrorMessage, Field, RangeInput, TextInput } from '@/components/ui/Field';
import { downloadBlob } from '@/lib/download';
import { eccLevels, encodeQr, QrTooLongError, type EccLevel } from '@/lib/qr/encode';
import {
  buildEmail,
  buildPhone,
  buildSms,
  buildVcard,
  buildWifi,
  normalizeUrl,
  payloadKinds,
  type PayloadKind,
} from '@/lib/qr/payload';
import { defaultStyle, qrToCanvas, qrToSvg, type QrStyle } from '@/lib/qr/render';

export default function QrCodeTool() {
  const [kind, setKind] = useState<PayloadKind>('url');

  const [url, setUrl] = useState('https://toolpit.app');
  const [plain, setPlain] = useState('');
  const [wifi, setWifi] = useState({
    ssid: '',
    password: '',
    security: 'WPA' as 'WPA' | 'WEP' | 'nopass',
    hidden: false,
  });
  const [vcard, setVcard] = useState({
    firstName: '',
    lastName: '',
    organization: '',
    jobTitle: '',
    phone: '',
    email: '',
    website: '',
  });
  const [email, setEmail] = useState({ address: '', subject: '', body: '' });
  const [sms, setSms] = useState({ number: '', message: '' });
  const [phone, setPhone] = useState('');

  const [ecc, setEcc] = useState<EccLevel>('M');
  const [style, setStyle] = useState<QrStyle>({ ...defaultStyle, scale: 10 });
  const [pngSize, setPngSize] = useState(1024);

  const payload = useMemo(() => {
    switch (kind) {
      case 'url':
        return normalizeUrl(url);
      case 'wifi':
        return wifi.ssid ? buildWifi(wifi) : '';
      case 'vcard':
        return vcard.firstName || vcard.lastName || vcard.email ? buildVcard(vcard) : '';
      case 'email':
        return email.address ? buildEmail(email) : '';
      case 'sms':
        return sms.number ? buildSms(sms) : '';
      case 'phone':
        return phone ? buildPhone(phone) : '';
      default:
        return plain;
    }
  }, [kind, url, plain, wifi, vcard, email, sms, phone]);

  const encoded = useMemo(() => {
    if (!payload.trim()) return { matrix: null, error: null as string | null };
    try {
      return { matrix: encodeQr(payload, { ecc }), error: null };
    } catch (cause) {
      return {
        matrix: null,
        error:
          cause instanceof QrTooLongError
            ? cause.message
            : 'That text could not be encoded as a QR code.',
      };
    }
  }, [payload, ecc]);

  const svg = encoded.matrix ? qrToSvg(encoded.matrix, style) : null;

  function updateStyle<K extends keyof QrStyle>(key: K, value: QrStyle[K]) {
    setStyle((current) => ({ ...current, [key]: value }));
  }

  function downloadSvg() {
    if (!encoded.matrix || !svg) return;
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'qr-code.svg');
  }

  async function downloadPng() {
    if (!encoded.matrix) return;
    // Pick the module size that lands closest to the requested pixel width, so
    // the grid stays on whole pixels and the edges stay hard.
    const modules = encoded.matrix.size + style.margin * 2;
    const scale = Math.max(1, Math.round(pngSize / modules));
    const canvas = qrToCanvas(encoded.matrix, { ...style, scale });

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) downloadBlob(blob, `qr-code-${canvas.width}px.png`);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <ToolSurface className="flex flex-col gap-5">
        <Dropdown
          label="What should the code do?"
          value={kind}
          onChange={(value) => value && setKind(value as PayloadKind)}
          options={payloadKinds.map((entry) => ({ value: entry.value, label: entry.label }))}
        />

        {kind === 'url' ? (
          <Field label="Link" hint="A scheme is added for you if you leave it off.">
            {({ id }) => (
              <TextInput
                id={id}
                value={url}
                inputMode="url"
                placeholder="toolpit.app"
                onChange={(event) => setUrl(event.target.value)}
              />
            )}
          </Field>
        ) : null}

        {kind === 'text' ? (
          <Field label="Text">
            {({ id }) => (
              <textarea
                id={id}
                rows={5}
                value={plain}
                onChange={(event) => setPlain(event.target.value)}
                placeholder="Anything at all — a note, a serial number, a recipe."
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm transition-colors hover:border-line-strong focus:border-accent"
              />
            )}
          </Field>
        ) : null}

        {kind === 'wifi' ? (
          <>
            <Field label="Network name (SSID)">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={wifi.ssid}
                  onChange={(event) => setWifi({ ...wifi, ssid: event.target.value })}
                />
              )}
            </Field>
            <Dropdown
              label="Security"
              value={wifi.security}
              onChange={(value) =>
                value && setWifi({ ...wifi, security: value as typeof wifi.security })
              }
              options={[
                { value: 'WPA', label: 'WPA / WPA2 / WPA3' },
                { value: 'WEP', label: 'WEP' },
                { value: 'nopass', label: 'Open — no password' },
              ]}
            />
            {wifi.security !== 'nopass' ? (
              <Field
                label="Password"
                hint="This goes into the code itself. Anyone who scans it gets the password — which is the point, but worth knowing before you print it."
              >
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={wifi.password}
                    onChange={(event) => setWifi({ ...wifi, password: event.target.value })}
                  />
                )}
              </Field>
            ) : null}
            <Checkbox
                label={<>This network is hidden</>}
                checked={wifi.hidden}
                onChange={(checked) => setWifi({ ...wifi, hidden: checked })}
              />
          </>
        ) : null}

        {kind === 'vcard' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ['firstName', 'First name'],
                ['lastName', 'Last name'],
                ['organization', 'Organisation'],
                ['jobTitle', 'Job title'],
                ['phone', 'Phone'],
                ['email', 'Email'],
                ['website', 'Website'],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                {({ id }) => (
                  <TextInput
                    id={id}
                    value={vcard[key]}
                    onChange={(event) => setVcard({ ...vcard, [key]: event.target.value })}
                  />
                )}
              </Field>
            ))}
          </div>
        ) : null}

        {kind === 'email' ? (
          <>
            <Field label="Send to">
              {({ id }) => (
                <TextInput
                  id={id}
                  inputMode="email"
                  value={email.address}
                  onChange={(event) => setEmail({ ...email, address: event.target.value })}
                />
              )}
            </Field>
            <Field label="Subject">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={email.subject}
                  onChange={(event) => setEmail({ ...email, subject: event.target.value })}
                />
              )}
            </Field>
            <Field label="Message">
              {({ id }) => (
                <textarea
                  id={id}
                  rows={3}
                  value={email.body}
                  onChange={(event) => setEmail({ ...email, body: event.target.value })}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm transition-colors hover:border-line-strong focus:border-accent"
                />
              )}
            </Field>
          </>
        ) : null}

        {kind === 'sms' ? (
          <>
            <Field label="Number">
              {({ id }) => (
                <TextInput
                  id={id}
                  inputMode="tel"
                  value={sms.number}
                  onChange={(event) => setSms({ ...sms, number: event.target.value })}
                />
              )}
            </Field>
            <Field label="Message">
              {({ id }) => (
                <TextInput
                  id={id}
                  value={sms.message}
                  onChange={(event) => setSms({ ...sms, message: event.target.value })}
                />
              )}
            </Field>
          </>
        ) : null}

        {kind === 'phone' ? (
          <Field label="Number">
            {({ id }) => (
              <TextInput
                id={id}
                inputMode="tel"
                value={phone}
                placeholder="+1 555 0100"
                onChange={(event) => setPhone(event.target.value)}
              />
            )}
          </Field>
        ) : null}

        <div className="border-t border-line pt-5">
          <ToolSectionHeading>Appearance</ToolSectionHeading>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code colour">
            {({ id }) => (
              <input
                id={id}
                type="color"
                value={style.dark}
                onChange={(event) => updateStyle('dark', event.target.value)}
                className="h-11 w-full cursor-pointer rounded-xl border border-line bg-surface p-1"
              />
            )}
          </Field>
          <Field label="Background">
            {({ id }) => (
              <input
                id={id}
                type="color"
                value={style.light}
                disabled={style.transparent}
                onChange={(event) => updateStyle('light', event.target.value)}
                className="h-11 w-full cursor-pointer rounded-xl border border-line bg-surface p-1 disabled:opacity-40"
              />
            )}
          </Field>
        </div>

        <Checkbox
                label={<>Transparent background</>}
                checked={style.transparent}
                onChange={(checked) => updateStyle('transparent', checked)}
              />

        <Field
          label={`Corner rounding — ${Math.round(style.radius * 200)}%`}
          hint="Cosmetic only. Scanners read the grid, not the corners."
        >
          {({ id }) => (
            <RangeInput
              id={id}
              min={0}
              max={50}
              step={5}
              value={style.radius * 100}
              onChange={(event) => updateStyle('radius', Number(event.target.value) / 100)}
            />
          )}
        </Field>

        <Field
          label={`Quiet zone — ${style.margin} modules`}
          hint="The empty border. Below four, some scanners lose the code against a busy background."
        >
          {({ id }) => (
            <RangeInput
              id={id}
              min={0}
              max={8}
              step={1}
              value={style.margin}
              onChange={(event) => updateStyle('margin', Number(event.target.value))}
            />
          )}
        </Field>

        <Dropdown
          label="Error correction"
          value={ecc}
          onChange={(value) => value && setEcc(value as EccLevel)}
          options={eccLevels.map((level) => ({
            value: level.value,
            label: level.label,
            description: level.description,
          }))}
        />
      </ToolSurface>

      <ToolSurface className="flex flex-col gap-5">
        <ToolSectionHeading>Your code</ToolSectionHeading>

        <div
          className="grid aspect-square w-full place-items-center overflow-hidden rounded-xl border border-line p-4"
          style={{ background: style.transparent ? undefined : style.light }}
        >
          {svg ? (
            <div
              className="size-full [&>svg]:size-full"
              // The SVG is built from our own encoder output — colours and
              // integers only, with no path through user-supplied markup.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <p className="px-6 text-center text-sm text-muted">
              {encoded.error ?? 'Fill in the details and your code appears here.'}
            </p>
          )}
        </div>

        <ErrorMessage>{encoded.error}</ErrorMessage>

        {encoded.matrix ? (
          <p className="text-xs text-muted">
            Version {encoded.matrix.version} · {encoded.matrix.size}×{encoded.matrix.size} modules ·
            recovers up to{' '}
            {{ L: '7%', M: '15%', Q: '25%', H: '30%' }[encoded.matrix.ecc]} damage
          </p>
        ) : null}

        <Field label={`PNG size — about ${pngSize}px`}>
          {({ id }) => (
            <RangeInput
              id={id}
              min={256}
              max={4096}
              step={128}
              value={pngSize}
              onChange={(event) => setPngSize(Number(event.target.value))}
            />
          )}
        </Field>

        <div className="flex flex-col gap-2">
          <Button onClick={downloadPng} disabled={!encoded.matrix}>
            Download PNG
          </Button>
          <Button variant="secondary" onClick={downloadSvg} disabled={!encoded.matrix}>
            Download SVG
          </Button>
          {svg ? <CopyButton text={svg} label="Copy the SVG markup" /> : null}
        </div>

        <p className="text-xs text-muted">
          This code points straight at your content. There is no short link in the middle, so it
          cannot expire, start charging, or count who scanned it.
        </p>
      </ToolSurface>
    </div>
  );
}
