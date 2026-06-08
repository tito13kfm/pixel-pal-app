import { render, screen } from '@testing-library/react';

function Hello({ name }: { name: string }) {
  return <p>Hello {name}</p>;
}

test('renders a component and queries it', () => {
  render(<Hello name="pixel" />);
  expect(screen.getByText('Hello pixel')).toBeInTheDocument();
});
