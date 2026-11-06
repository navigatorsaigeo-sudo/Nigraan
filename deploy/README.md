# NIGRAAN deploy (DGX + Oracle nginx)

## Do you need a backend domain?

**Recommended: yes** — e.g. `nigraan-api.aigeo360.com`.

| Setup | Need separate backend domain? |
|---|---|
| Frontend on Vercel (`nigraan.aigeo360.com` / `nigraan-beta.vercel.app`) + API on this DGX | **Yes** (or a public IP:port). Browser calls stay same-origin via Vercel rewrites in `web/vercel.json`. |
| Serve React `web/dist` and `/api` from the **same** host/domain | **No** — one domain is enough. |

IP-only (`http://152.67.162.136:8787`) works for testing after you open **TCP 8787** in the OCI security list. A domain on **443** is better (HTTPS, no extra OCI port).

## 1. Systemd on DGX

```bash
cd /srv/agn-apps/NIGRAAN/nig/nigraan-local
sudo bash deploy/install-systemd.sh
curl -sS http://127.0.0.1:8787/api/health
```

## 2. Oracle nginx

```bash
# from this machine
scp -i /srv/agn-apps/agn-deploy-dashboard/ssh-key-2026-05-08.key \
  deploy/nginx-nigraan-oracle-edge.conf ubuntu@152.67.162.136:/tmp/agn-nigraan.conf
ssh -i /srv/agn-apps/agn-deploy-dashboard/ssh-key-2026-05-08.key ubuntu@152.67.162.136 \
  'sudo bash /srv/agn-apps/agn-deploy-dashboard/scripts/agn_apply_nginx.sh /tmp/agn-nigraan.conf nigraan'
```

DNS (recommended):

```
nigraan-api.aigeo360.com  A  152.67.162.136
```

Then on Oracle: `sudo certbot --nginx -d nigraan-api.aigeo360.com`

## 3. Vercel

`web/vercel.json` rewrites `/api/*` to `https://nigraan-api.aigeo360.com`. Redeploy the frontend after DNS + cert are live.
