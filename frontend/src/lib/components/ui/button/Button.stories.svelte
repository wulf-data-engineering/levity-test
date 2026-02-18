<script module>
    import {defineMeta} from '@storybook/addon-svelte-csf';
    import {fn} from 'storybook/test';
    import {Button} from ".";

    const {Story} = defineMeta({
        render,
        title: 'Example/Button',
        component: Button,
        tags: ['autodocs'],
        args: {
            onclick: fn(),
            children: 'Button',
        }
    });
</script>

{#snippet render(args)}
    <Button {...args}>{args.children}</Button>
{/snippet}

<Story name="Default"/>

<Story name="Outline" args={{ variant: 'outline'}}/>

<Story name="Secondary" args={{ variant: 'secondary'}}/>

<Story name="Destructive" args={{ variant: 'destructive'}}/>

<Story name="Ghost" args={{ variant: 'ghost'}}/>

<Story name="href" args={{ href: 'https://github.com/wulf-data-engineering/levity' }}/>

<Story name="Link" args={{ variant: 'link' }}/>
