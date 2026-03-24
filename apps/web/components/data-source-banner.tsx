export function DataSourceBanner({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <div className="inline-status">{message}</div>;
}
