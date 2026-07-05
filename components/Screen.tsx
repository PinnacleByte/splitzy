import { ButtonLink } from "./Button";

export function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-primary" />
    </div>
  );
}

export function NotFound({ what = "page" }: { what?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-5xl">🤷</p>
      <p className="font-bold">This {what} doesn&apos;t exist</p>
      <ButtonLink href="/" variant="soft">
        Back to groups
      </ButtonLink>
    </div>
  );
}
