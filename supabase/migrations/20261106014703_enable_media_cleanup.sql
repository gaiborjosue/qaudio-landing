create index media_assets_owner on public.media_assets(owner_id);
-- The deployed worker passed a dry run and an isolated real Storage deletion.
select cron.alter_job((select jobid from cron.job where jobname='media-cleanup-daily'),active:=true);
