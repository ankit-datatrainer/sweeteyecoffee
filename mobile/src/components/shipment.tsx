import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { errorMessage, get, post } from '@/lib/api';
import { money } from '@/lib/format';
import { confirmAction, SwitchRow } from './admin';
import { Button, Card, Field, Notice, T } from './ui';

type ShipmentInfo = {
  configured: boolean;
  eligible: boolean;
  environment: string;
  shipment: {
    status: string;
    tracking: string[];
    labels: string[];
    error: string | null;
    carrier_charge: number | null;
  } | null;
};
export function ShipmentTools({ orderId }: { orderId: number }) {
  const [info, setInfo] = useState<ShipmentInfo | null>(null),
    [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const [boxes, setBoxes] = useState([{ weight: '', length: '', width: '', height: '' }]);
  useEffect(() => {
    get<ShipmentInfo>(`/admin/orders/${orderId}/shipment`)
      .then(setInfo)
      .catch((e) => setError(errorMessage(e)));
  }, [orderId]);
  const buy = async () => {
    setBusy(true);
    setError(null);
    try {
      await post(`/admin/orders/${orderId}/shipment`, { packages: boxes, confirm_purchase: confirmed });
      setInfo(await get<ShipmentInfo>(`/admin/orders/${orderId}/shipment`));
      setConfirmed(false);
    } catch (e) {
      setError(errorMessage(e));
      get<ShipmentInfo>(`/admin/orders/${orderId}/shipment`)
        .then(setInfo)
        .catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 12 }}>
      <T variant="heading">UPS shipping labels</T>
      {error && <Notice tone="danger">{error}</Notice>}
      {info?.shipment?.status === 'created' ? (
        <>
          <T variant="body">Carrier charge: {money(info.shipment.carrier_charge)}</T>
          {info.shipment.tracking.map((tracking, i) => (
            <View key={tracking} style={{ gap: 8 }}>
              <T variant="small">{tracking}</T>
              <Button
                title={`Open printable label ${i + 1}`}
                variant="outline"
                size="md"
                onPress={() => Linking.openURL(info.shipment!.labels[i])}
              />
            </View>
          ))}
          <T variant="small">
            Print every package label, attach it, then arrange pickup or drop-off. Mark the order on its way after
            carrier handoff.
          </T>
        </>
      ) : info?.eligible ? (
        <>
          {!info.configured && <Notice>UPS Shipping API must be configured before purchasing labels.</Notice>}
          {info.shipment && ['unknown', 'creating'].includes(info.shipment.status) ? (
            <Notice tone="danger">
              {info.shipment.error ??
                'UPS may have accepted this shipment. Check UPS history before buying another label.'}
            </Notice>
          ) : (
            <>
              <T variant="small">Measure each packed box. Weight is in pounds; dimensions are in inches.</T>
              {boxes.map((box, i) => (
                <View key={i} style={{ gap: 8 }}>
                  <T variant="subheading">Package {i + 1}</T>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {(['weight', 'length', 'width', 'height'] as const).map((key) => (
                      <Field
                        key={key}
                        label={key === 'weight' ? 'Weight (lb)' : `${key[0].toUpperCase() + key.slice(1)} (in)`}
                        keyboardType="decimal-pad"
                        value={box[key]}
                        onChangeText={(v) =>
                          setBoxes((all) => all.map((b, index) => (index === i ? { ...b, [key]: v } : b)))
                        }
                        containerStyle={{ flexGrow: 1, flexBasis: '40%' }}
                      />
                    ))}
                  </View>
                  {boxes.length > 1 && (
                    <Button
                      title="Remove package"
                      variant="outline"
                      size="md"
                      onPress={() => setBoxes((all) => all.filter((_, index) => index !== i))}
                    />
                  )}
                </View>
              ))}
              <Button
                title="Add package"
                variant="outline"
                size="md"
                disabled={boxes.length >= 50}
                onPress={() => setBoxes([...boxes, { weight: '', length: '', width: '', height: '' }])}
              />
              <SwitchRow
                label={
                  info.environment === 'production'
                    ? 'I authorize purchasing UPS labels'
                    : 'I authorize sandbox label creation'
                }
                sub={
                  info.environment === 'production'
                    ? 'UPS will bill the shop account at its carrier rate.'
                    : 'Creates test labels in the UPS sandbox.'
                }
                value={confirmed}
                onChange={setConfirmed}
              />
              <Button
                title={info.environment === 'production' ? 'Purchase UPS labels' : 'Create sandbox labels'}
                disabled={!confirmed || !info.configured}
                loading={busy}
                onPress={() =>
                  confirmAction(
                    'Create these shipping labels?',
                    'Confirm the packed weights, dimensions and delivery address before continuing. A label does not arrange carrier pickup.',
                    'Create labels',
                    buy,
                  )
                }
              />
            </>
          )}
        </>
      ) : (
        <T variant="small">
          Labels are available for paid, active UPS delivery orders. Test orders cannot purchase labels.
        </T>
      )}
    </Card>
  );
}
