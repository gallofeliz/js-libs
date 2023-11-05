# Beewi Reader

```typescript
import { readBeewiDevice, BeewiDeviceReader } from '@gallofeliz/beewi-reader'

await readBeewiDevice({
    logger,
    device: 'hci0',
    hmac: 'xx:xx:xx:xx:xx:xx'
})

const reader = new BeewiDeviceReader({
    logger,
    // ...
})

await reader.read({hmac: 'xx:xx:xx:xx:xx:xx', device: 'hci0'})
```
